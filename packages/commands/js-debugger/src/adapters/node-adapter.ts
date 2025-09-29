import { ChildProcess } from 'child_process';
import path from 'path';
import {
  IDebugAdapter,
  ICDPClient,
  DebugState,
  EvaluationResult,
  StackFrame,
  Scope,
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
} from '../types/index.js';
import { CDPClient } from '../cdp/client.js';
import { spawnNodeProcess } from './node/process-utils.js';
import {
  connectToInspector,
  normalizeFilePath,
  createStackFrames,
  cleanup as cleanupUtils,
} from './node/cdp-utils.js';
import { handleDebuggerPaused } from './node/event-handlers.js';
import type {
  NodeCDPBreakpoint,
  NodeCDPPausedEventParams,
  NodeDebugAdapterOptions,
} from './node/types.js';
import { getScopesFromCurrentCallFrame } from './node/getScopesFromCurrentCallFrame.js';
import { executeStepOperation } from './node/step-operations.js';
import { initializeCDP } from './node/cdp-initialization.js';
import {
  createDebuggerResumedHandler,
  createScriptParsedHandler,
  createConsoleMessageHandler,
  createConsoleAPICalledHandler,
} from './node/event-handler-wrappers.js';

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
  private breakpoints = new Map<string, NodeCDPBreakpoint>();
  private currentCallFrames: NodeCDPPausedEventParams['callFrames'] = [];
  private isConnected = false;
  private isPaused = false;
  private runtime: string;
  private hasResumedFromInitialPause = false;

  // Event handlers
  private consoleHandler: ConsoleHandler | null = null;
  private pauseHandler: PauseHandler | null = null;
  private resumeHandler: ResumeHandler | null = null;

  public constructor(options?: NodeDebugAdapterOptions) {
    this.cdpClient = options?.cdpClient || new CDPClient();
    // Use the specified command or default to 'node'
    this.runtime = options?.request?.command || 'node';
  }

  public async connect(target: string): Promise<void> {
    try {
      // Check if target is a file path or WebSocket URL
      if (target.startsWith('ws://') || target.startsWith('wss://')) {
        // Direct connection to existing Node.js inspector
        await connectToInspector(this.cdpClient, target, this.inspectorPort);
      } else {
        // Spawn Node.js process with inspector
        const result = await spawnNodeProcess(target, this.runtime);
        this.nodeProcess = result.process;
        this.inspectorPort = result.port;
        this.inspectorUrl = result.url;
        // Use the full inspector URL if we captured it, otherwise fall back to discovery
        const connectUrl =
          this.inspectorUrl || `ws://localhost:${this.inspectorPort}`;
        await connectToInspector(
          this.cdpClient,
          connectUrl,
          this.inspectorPort,
        );
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

  public async disconnect(): Promise<void> {
    await this.cleanup();
  }

  public async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugger');
    }

    const normalizedPath = normalizeFilePath(file);

    // Convert to file:// URL for Node.js
    const fileUrl = normalizedPath.startsWith('file://')
      ? normalizedPath
      : `file://${path.resolve(normalizedPath)}`;

    try {
      const result = await this.cdpClient.send<NodeCDPBreakpoint>(
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

  public async removeBreakpoint(id: string): Promise<void> {
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

  public async continue(): Promise<DebugState> {
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

  public async stepOver(): Promise<DebugState> {
    return this.executeStep('Debugger.stepOver');
  }

  public async stepInto(): Promise<DebugState> {
    return this.executeStep('Debugger.stepInto');
  }

  public async stepOut(): Promise<DebugState> {
    return this.executeStep('Debugger.stepOut');
  }

  private async executeStep(
    operation: 'Debugger.stepOver' | 'Debugger.stepInto' | 'Debugger.stepOut',
  ): Promise<DebugState> {
    return executeStepOperation(
      this.cdpClient,
      operation,
      this.resumeHandler,
      this.isConnected,
      (paused) => {
        this.isPaused = paused;
      },
    );
  }

  public async evaluate(expression: string): Promise<EvaluationResult> {
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

  public async getStackTrace(): Promise<StackFrame[]> {
    if (!this.isPaused || this.currentCallFrames.length === 0) {
      return [];
    }

    return createStackFrames(this.currentCallFrames);
  }

  public async getScopes(frameId: number): Promise<Scope[]> {
    if (!this.isPaused || frameId >= this.currentCallFrames.length) {
      return [];
    }

    return getScopesFromCurrentCallFrame(
      this.cdpClient,
      this.currentCallFrames,
      frameId,
    );
  }

  public onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandler = handler;
  }

  public onPaused(handler: PauseHandler): void {
    this.pauseHandler = handler;
  }

  public onResumed(handler: ResumeHandler): void {
    this.resumeHandler = handler;
  }

  // Private methods

  private async initializeCDP(): Promise<void> {
    const result = await initializeCDP(
      this.cdpClient,
      {
        onDebuggerPaused: (params) => {
          this.handleDebuggerPaused(params);
        },
        onDebuggerResumed: () => {
          this.handleDebuggerResumed();
        },
        onScriptParsed: (params) => {
          this.handleScriptParsed(params);
        },
        onConsoleMessage: (params) => {
          this.handleConsoleMessage(params);
        },
        onConsoleAPICalled: (params) => {
          this.handleConsoleAPICalled(params);
        },
      },
      this.isPaused,
      this.hasResumedFromInitialPause,
    );

    if (result.shouldSetResumed) {
      this.hasResumedFromInitialPause = true;
    }
  }

  private handleDebuggerPaused(params: NodeCDPPausedEventParams): void {
    this.isPaused = true;

    const result = handleDebuggerPaused(
      params,
      this.hasResumedFromInitialPause,
      this.cdpClient,
      this.pauseHandler,
    );

    if (!result.shouldNotify) {
      this.hasResumedFromInitialPause = true;
    }

    this.currentCallFrames = result.callFrames;
  }

  private handleDebuggerResumed = createDebuggerResumedHandler(
    () => this.resumeHandler,
    (paused) => {
      this.isPaused = paused;
    },
    (callFrames) => {
      this.currentCallFrames = callFrames;
    },
  );

  private handleScriptParsed = createScriptParsedHandler(
    this.scriptUrlToId,
    this.scriptIdToUrl,
  );

  private handleConsoleMessage = createConsoleMessageHandler(
    () => this.consoleHandler,
  );

  private handleConsoleAPICalled = createConsoleAPICalledHandler(
    () => this.consoleHandler,
  );

  private async cleanup(): Promise<void> {
    this.isConnected = false;
    this.isPaused = false;
    this.currentCallFrames = [];

    await cleanupUtils(
      this.cdpClient,
      this.nodeProcess,
      this.scriptUrlToId,
      this.scriptIdToUrl,
      this.breakpoints,
    );

    this.nodeProcess = null;
  }
}
