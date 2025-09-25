import { spawn, ChildProcess } from 'child_process';
import { URL } from 'url';
import path from 'path';
import getPort from 'get-port';
import {
  IDebugAdapter,
  ICDPClient,
  DebugState,
  EvaluationResult,
  StackFrame,
  Scope,
  Variable,
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
  ConsoleMessage,
} from '../types.js';
import { CDPClient } from '../cdp/client.js';
import {
  validateScriptPath,
  parseInspectorUrl,
  waitForCondition,
  discoverInspectorTargets,
} from '../utils/node-inspector.js';

// CDP Domain interfaces for type safety
interface CDPBreakpoint {
  breakpointId: string;
  locations: Array<{
    scriptId: string;
    lineNumber: number;
    columnNumber?: number;
  }>;
}

interface CDPPausedEventParams {
  reason: 'breakpoint' | 'step' | 'exception' | 'other';
  data?: unknown;
  callFrames: Array<{
    callFrameId: string;
    functionName: string;
    location: {
      scriptId: string;
      lineNumber: number;
      columnNumber?: number;
    };
    url?: string;
    scopeChain: Array<{
      type: 'global' | 'local' | 'closure' | 'with' | 'catch';
      object: {
        objectId?: string;
        type: string;
        className?: string;
        description?: string;
      };
      name?: string;
    }>;
  }>;
  exception?: {
    type: string;
    value?: unknown;
    description?: string;
    className?: string;
  };
}

interface CDPScriptParsedEventParams {
  scriptId: string;
  url: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  executionContextId: number;
  hash: string;
}

interface CDPConsoleAPICalledEventParams {
  type:
    | 'log'
    | 'debug'
    | 'info'
    | 'error'
    | 'warning'
    | 'dir'
    | 'dirxml'
    | 'table'
    | 'trace'
    | 'clear'
    | 'startGroup'
    | 'startGroupCollapsed'
    | 'endGroup'
    | 'assert'
    | 'profile'
    | 'profileEnd'
    | 'count'
    | 'timeEnd';
  args: Array<{
    type: string;
    value?: unknown;
    description?: string;
    objectId?: string;
  }>;
  executionContextId: number;
  timestamp: number;
  stackTrace?: {
    callFrames: Array<{
      functionName: string;
      scriptId: string;
      url: string;
      lineNumber: number;
      columnNumber: number;
    }>;
  };
}

type NodeDebugAdapterOptions = {
  cdpClient?: ICDPClient;
  request?: {
    command?: string;
  };
};
/**
 * Node.js debug adapter using Chrome DevTools Protocol
 */
export class NodeDebugAdapter implements IDebugAdapter {
  private cdpClient: ICDPClient;
  private nodeProcess: ChildProcess | null = null;
  private inspectorPort = 9229;
  private inspectorUrl: string | null = null;
  private scriptUrlToId = new Map<string, string>();
  private scriptIdToUrl = new Map<string, string>();
  private breakpoints = new Map<string, CDPBreakpoint>();
  private currentCallFrames: CDPPausedEventParams['callFrames'] = [];
  private isConnected = false;
  private isPaused = false;
  private runtime: string;
  private hasResumedFromInitialPause = false;

  // Event handlers
  private consoleHandler: ConsoleHandler | null = null;
  private pauseHandler: PauseHandler | null = null;
  private resumeHandler: ResumeHandler | null = null;

  constructor(options?: NodeDebugAdapterOptions) {
    this.cdpClient = options?.cdpClient || new CDPClient();
    // Use the specified command or default to 'node'
    this.runtime = options?.request?.command || 'node';
  }

  async connect(target: string): Promise<void> {
    try {
      // Check if target is a file path or WebSocket URL
      if (target.startsWith('ws://') || target.startsWith('wss://')) {
        // Direct connection to existing Node.js inspector
        await this.connectToInspector(target);
      } else {
        // Spawn Node.js process with inspector
        await this.spawnNodeProcess(target);
        // Use the full inspector URL if we captured it, otherwise fall back to discovery
        const connectUrl =
          this.inspectorUrl || `ws://localhost:${this.inspectorPort}`;
        await this.connectToInspector(connectUrl);
      }

      await this.initializeCDP();
      this.isConnected = true;
    } catch (error) {
      await this.cleanup();
      throw new Error(
        `Failed to connect to Node.js debugger: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanup();
  }

  async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugger');
    }

    const normalizedPath = this.normalizeFilePath(file);

    // Convert to file:// URL for Node.js
    const fileUrl = normalizedPath.startsWith('file://')
      ? normalizedPath
      : `file://${path.resolve(normalizedPath)}`;

    try {
      const result = await this.cdpClient.send<CDPBreakpoint>(
        'Debugger.setBreakpointByUrl',
        {
          lineNumber: line - 1, // CDP uses 0-based line numbers
          url: fileUrl,
          condition,
        },
      );

      if (result.breakpointId) {
        this.breakpoints.set(result.breakpointId, result);
        return result.breakpointId;
      }

      throw new Error('Failed to set breakpoint');
    } catch (error) {
      throw new Error(
        `Failed to set breakpoint: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async removeBreakpoint(id: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugger');
    }

    try {
      await this.cdpClient.send('Debugger.removeBreakpoint', {
        breakpointId: id,
      });

      this.breakpoints.delete(id);
    } catch (error) {
      throw new Error(
        `Failed to remove breakpoint: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async continue(): Promise<DebugState> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugger');
    }

    try {
      // If this is the first continue after --inspect-brk
      if (this.isPaused && !this.hasResumedFromInitialPause) {
        await this.cdpClient.send('Runtime.runIfWaitingForDebugger');
        this.hasResumedFromInitialPause = true;
      } else {
        await this.cdpClient.send('Debugger.resume');
      }

      this.isPaused = false;

      if (this.resumeHandler) {
        this.resumeHandler();
      }

      return {
        status: 'running',
      };
    } catch (error) {
      throw new Error(
        `Failed to continue: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async stepOver(): Promise<DebugState> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugger');
    }

    try {
      await this.cdpClient.send('Debugger.stepOver');
      this.isPaused = false;

      if (this.resumeHandler) {
        this.resumeHandler();
      }

      return {
        status: 'running',
      };
    } catch (error) {
      throw new Error(
        `Failed to step over: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async stepInto(): Promise<DebugState> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugger');
    }

    try {
      await this.cdpClient.send('Debugger.stepInto');
      this.isPaused = false;

      if (this.resumeHandler) {
        this.resumeHandler();
      }

      return {
        status: 'running',
      };
    } catch (error) {
      throw new Error(
        `Failed to step into: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async stepOut(): Promise<DebugState> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugger');
    }

    try {
      await this.cdpClient.send('Debugger.stepOut');
      this.isPaused = false;

      if (this.resumeHandler) {
        this.resumeHandler();
      }

      return {
        status: 'running',
      };
    } catch (error) {
      throw new Error(
        `Failed to step out: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async evaluate(expression: string): Promise<EvaluationResult> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugger');
    }

    try {
      // If we're paused and have call frames, evaluate in the current frame context
      const callFrameId =
        this.currentCallFrames.length > 0
          ? this.currentCallFrames[0].callFrameId
          : undefined;

      const result = await this.cdpClient.send<{
        result: {
          type: string;
          value?: unknown;
          description?: string;
          className?: string;
          objectId?: string;
        };
        exceptionDetails?: {
          text: string;
          exception?: {
            description?: string;
          };
        };
      }>('Runtime.evaluate', {
        expression,
        contextId: callFrameId,
        generatePreview: true,
        throwOnSideEffect: false,
      });

      if (result.exceptionDetails) {
        return {
          value: null,
          type: 'error',
          error:
            result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text,
        };
      }

      return {
        value: result.result.value,
        type: result.result.type,
        description: result.result.description,
      };
    } catch (error) {
      return {
        value: null,
        type: 'error',
        error:
          error instanceof Error ? error.message : 'Unknown evaluation error',
      };
    }
  }

  async getStackTrace(): Promise<StackFrame[]> {
    if (!this.isPaused || this.currentCallFrames.length === 0) {
      return [];
    }

    return this.currentCallFrames.map((frame, index) => ({
      id: index,
      functionName: frame.functionName || '<anonymous>',
      file: this.convertScriptUrlToFilePath(frame.url || ''),
      line: frame.location.lineNumber + 1, // Convert back to 1-based
      column: frame.location.columnNumber,
    }));
  }

  async getScopes(frameId: number): Promise<Scope[]> {
    if (!this.isPaused || frameId >= this.currentCallFrames.length) {
      return [];
    }

    const frame = this.currentCallFrames[frameId];
    const scopes: Scope[] = [];

    for (const scope of frame.scopeChain) {
      const variables = await this.getVariablesForScope(scope.object.objectId);

      scopes.push({
        type: scope.type as Scope['type'],
        name: scope.name,
        variables,
      });
    }

    return scopes;
  }

  onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandler = handler;
  }

  onPaused(handler: PauseHandler): void {
    this.pauseHandler = handler;
  }

  onResumed(handler: ResumeHandler): void {
    this.resumeHandler = handler;
  }

  // Private methods

  private async spawnNodeProcess(scriptPath: string): Promise<void> {
    // Validate script path first
    await validateScriptPath(scriptPath);

    // Find an available port using get-port
    this.inspectorPort = await getPort({ port: 9229 });

    return new Promise((resolve, reject) => {
      // Use the runtime directly (no npx wrapper)
      const command = this.runtime;
      // Always use --inspect-brk to ensure we can attach debugger before script runs
      const args = [
        `--inspect-brk=${this.inspectorPort}`,
        path.resolve(scriptPath),
      ];

      this.nodeProcess = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      // Ensure cleanup on process exit
      const cleanup = () => {
        if (this.nodeProcess && !this.nodeProcess.killed) {
          this.nodeProcess.kill('SIGTERM');
        }
      };
      process.on('exit', cleanup);
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      this.nodeProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn Node.js process: ${error.message}`));
      });

      let inspectorUrl: string | null = null;
      let debuggerOutput = '';

      const handleOutput = (data: Buffer) => {
        const output = data.toString();
        debuggerOutput += output; // Collect all output for debugging
        const foundUrl = parseInspectorUrl(output);
        if (foundUrl) {
          inspectorUrl = foundUrl;
          // Store the full URL for connection
          this.inspectorUrl = foundUrl;
          // Give inspector a moment to fully initialize
          // tsx needs more time to transpile and start
          setTimeout(() => resolve(), 500);
        }
      };

      this.nodeProcess.stdout?.on('data', handleOutput);
      this.nodeProcess.stderr?.on('data', handleOutput);

      this.nodeProcess.on('exit', (code, signal) => {
        if (!inspectorUrl) {
          reject(
            new Error(
              `Node.js process exited before inspector started (code: ${code}, signal: ${signal})\nOutput: ${debuggerOutput}`,
            ),
          );
        }
      });

      // Timeout after 30 seconds (increased for tsx which needs to transpile)
      setTimeout(() => {
        if (this.nodeProcess && !this.nodeProcess.killed && !inspectorUrl) {
          reject(
            new Error(
              `Timeout waiting for Node.js inspector to start. Output so far: ${debuggerOutput}`,
            ),
          );
        }
      }, 30000);
    });
  }

  private async connectToInspector(wsUrl: string): Promise<void> {
    // If connecting to a specific WebSocket URL directly
    if (wsUrl.startsWith('ws://') || wsUrl.startsWith('wss://')) {
      console.error(`[DEBUG] Attempting to connect to: ${wsUrl}`);
      await waitForCondition(
        async () => {
          try {
            await this.cdpClient.connect(wsUrl);
            console.error(`[DEBUG] Successfully connected to CDP`);
            return true;
          } catch (error) {
            console.error(
              `[DEBUG] Failed to connect: ${error instanceof Error ? error.message : error}`,
            );
            return null;
          }
        },
        15000, // Increased from 5s to 15s
        500,
      );
      return;
    }

    // If connecting to localhost inspector, try to discover targets first
    try {
      const targets = await discoverInspectorTargets(this.inspectorPort);
      if (targets.length > 0) {
        await this.cdpClient.connect(targets[0].webSocketDebuggerUrl);
        return;
      }
    } catch (_error) {
      // Fallback to direct connection
    }

    // Fallback to constructing WebSocket URL
    const fallbackUrl = `ws://localhost:${this.inspectorPort}`;
    await waitForCondition(
      async () => {
        try {
          await this.cdpClient.connect(fallbackUrl);
          return true;
        } catch (_error) {
          return null;
        }
      },
      15000, // Increased from 10s to 15s
      500,
    );
    return;
  }

  private async initializeCDP(): Promise<void> {
    // Set up event handlers before enabling domains to catch early events
    this.cdpClient.on('Debugger.paused', (params) => {
      this.handleDebuggerPaused(params as CDPPausedEventParams);
    });

    this.cdpClient.on('Debugger.resumed', () => {
      this.handleDebuggerResumed();
    });

    this.cdpClient.on('Debugger.scriptParsed', (params) => {
      this.handleScriptParsed(params as CDPScriptParsedEventParams);
    });

    this.cdpClient.on('Console.messageAdded', (params) => {
      this.handleConsoleMessage(params);
    });

    this.cdpClient.on('Runtime.consoleAPICalled', (params) => {
      this.handleConsoleAPICalled(params as CDPConsoleAPICalledEventParams);
    });

    // Enable Runtime and Console domains first to capture all output
    await Promise.all([
      this.cdpClient.send('Runtime.enable'),
      this.cdpClient.send('Console.enable'),
    ]);

    // Enable Debugger domain
    await this.cdpClient.send('Debugger.enable');

    // Auto-resume from --inspect-brk if we haven't received a pause event
    if (!this.isPaused) {
      try {
        await this.cdpClient.send('Runtime.runIfWaitingForDebugger');
        this.hasResumedFromInitialPause = true;
      } catch (_error) {
        // Already running or command not needed
      }
    }
  }

  /**
   * Map CDP pause reasons to our DebugState pause reasons
   */
  private mapCDPReasonToDebugReason(
    cdpReason: string,
  ): DebugState['pauseReason'] {
    switch (cdpReason) {
      case 'breakpoint':
        return 'breakpoint';
      case 'step':
      case 'debugCommand':
        return 'step';
      case 'exception':
        return 'exception';
      case 'other':
      case 'pause':
      default:
        return 'entry'; // Default to entry for unknown reasons
    }
  }

  private handleDebuggerPaused(params: CDPPausedEventParams): void {
    this.isPaused = true;
    this.currentCallFrames = params.callFrames;

    // Auto-resume the initial pause from --inspect-brk
    if (!this.hasResumedFromInitialPause && params.reason === 'other') {
      this.hasResumedFromInitialPause = true;
      // Auto-resume execution
      this.cdpClient.send('Debugger.resume').catch(() => {
        // Ignore error - may already be running
      });
      // Don't notify pause handler for this automatic resume
      return;
    }

    const debugState: DebugState = {
      status: 'paused',
      pauseReason: this.mapCDPReasonToDebugReason(params.reason),
    };

    if (params.exception) {
      debugState.exception = {
        message: params.exception.description || 'Unknown exception',
        uncaught: params.reason === 'exception',
      };
    }

    if (this.pauseHandler) {
      this.pauseHandler(debugState);
    }
  }

  private handleDebuggerResumed(): void {
    this.isPaused = false;
    this.currentCallFrames = [];

    if (this.resumeHandler) {
      this.resumeHandler();
    }
  }

  private handleScriptParsed(params: CDPScriptParsedEventParams): void {
    this.scriptUrlToId.set(params.url, params.scriptId);
    this.scriptIdToUrl.set(params.scriptId, params.url);
  }

  private handleConsoleMessage(params: unknown): void {
    // Handle legacy console messages
    if (this.consoleHandler) {
      const message: ConsoleMessage = {
        level: 'log',
        timestamp: new Date().toISOString(),
        message: String(params),
        args: [params],
      };
      this.consoleHandler(message);
    }
  }

  private handleConsoleAPICalled(params: CDPConsoleAPICalledEventParams): void {
    if (!this.consoleHandler) {
      return;
    }

    const level = this.mapConsoleLevel(params.type);
    const args = params.args.map(
      (arg) => arg.value ?? arg.description ?? '[Object]',
    );
    const message = args.join(' ');

    const stackTrace = params.stackTrace?.callFrames.map((frame) => ({
      id: 0,
      functionName: frame.functionName,
      file: this.convertScriptUrlToFilePath(frame.url),
      line: frame.lineNumber + 1,
      column: frame.columnNumber,
    }));

    const consoleMessage: ConsoleMessage = {
      level,
      timestamp: new Date(params.timestamp).toISOString(),
      message,
      args,
      stackTrace,
    };

    this.consoleHandler(consoleMessage);
  }

  private mapConsoleLevel(
    cdpType: CDPConsoleAPICalledEventParams['type'],
  ): ConsoleMessage['level'] {
    switch (cdpType) {
      case 'warning':
        return 'warn';
      case 'error':
        return 'error';
      case 'debug':
        return 'debug';
      case 'info':
        return 'info';
      case 'trace':
        return 'trace';
      default:
        return 'log';
    }
  }

  private async getVariablesForScope(objectId?: string): Promise<Variable[]> {
    if (!objectId) return [];

    try {
      const result = await this.cdpClient.send<{
        result: Array<{
          name: string;
          value: {
            type: string;
            value?: unknown;
            description?: string;
          };
          configurable?: boolean;
          enumerable?: boolean;
        }>;
      }>('Runtime.getProperties', {
        objectId,
        ownProperties: true,
        generatePreview: true,
      });

      return result.result.map((prop) => {
        const runtimeValue = prop.value;

        let value: unknown;
        if (runtimeValue) {
          if (runtimeValue.value !== undefined) {
            value = runtimeValue.value;
          } else if (runtimeValue.description !== undefined) {
            value = runtimeValue.description;
          }
        }

        const inferredType =
          runtimeValue?.type ??
          (value !== undefined ? typeof value : 'unknown');

        return {
          name: prop.name,
          value,
          type: inferredType,
          configurable: prop.configurable,
          enumerable: prop.enumerable,
        };
      });
    } catch (error) {
      console.warn('Failed to get scope variables:', error);
      return [];
    }
  }

  private normalizeFilePath(filePath: string): string {
    // Convert Windows paths to Unix style and resolve relative paths
    const normalized = path.resolve(filePath).replace(/\\/g, '/');
    return normalized;
  }

  private convertScriptUrlToFilePath(scriptUrl: string): string {
    if (!scriptUrl) return '';

    // Handle file:// URLs
    if (scriptUrl.startsWith('file://')) {
      try {
        return new URL(scriptUrl).pathname;
      } catch {
        return scriptUrl.replace('file://', '');
      }
    }

    // Handle other Node.js internal URLs
    if (scriptUrl.startsWith('node:')) {
      return scriptUrl; // Keep Node.js internal modules as-is
    }

    return scriptUrl;
  }

  private async cleanup(): Promise<void> {
    this.isConnected = false;
    this.isPaused = false;
    this.currentCallFrames = [];

    // Disconnect CDP client
    try {
      await this.cdpClient.disconnect();
    } catch (error) {
      console.warn('Error disconnecting CDP client:', error);
    }

    // Kill Node.js process if we spawned it
    if (this.nodeProcess && !this.nodeProcess.killed) {
      try {
        this.nodeProcess.kill('SIGTERM');

        // Force kill after timeout
        setTimeout(() => {
          if (this.nodeProcess && !this.nodeProcess.killed) {
            this.nodeProcess.kill('SIGKILL');
          }
        }, 2000);
      } catch (error) {
        console.warn('Error killing Node.js process:', error);
      }

      this.nodeProcess = null;
    }

    // Clear state
    this.scriptUrlToId.clear();
    this.scriptIdToUrl.clear();
    this.breakpoints.clear();
  }
}
