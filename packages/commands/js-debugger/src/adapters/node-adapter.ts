import type { ChildProcess } from 'child_process';
import Emittery from 'emittery';
import type {
  IDebugAdapter,
  ITypedCDPClient,
  DebugRequest,
  DebugState,
  BreakpointRegistration,
  StackFrame,
  Scope,
  EvaluationResult,
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
  DebugSessionEvents,
} from '../types/index.js';
import type { CDPDebuggerPausedParams, CDPBreakpoint } from '../cdp/types.js';
import {
  ProcessSpawner,
  CDPConnection,
  ScopeInspector,
  SourceMapHandler,
  PauseHandlerManager,
  EventHandlersManager,
  ConnectionManager,
} from './node/index.js';
import { determineCodeOrigin } from './node/code-origin.js';

type NodeDebugAdapterOptions = {
  cdpClient?: ITypedCDPClient;
  request?: DebugRequest;
};

/**
 * Node.js debug adapter using Chrome DevTools Protocol
 */
export class NodeDebugAdapter implements IDebugAdapter {
  private cdpClient: ITypedCDPClient;
  private spawner: ProcessSpawner;
  private scopeInspector: ScopeInspector;
  protected sourceMapHandler: SourceMapHandler;
  private pauseHandlerManager: PauseHandlerManager;
  private eventHandlersManager: EventHandlersManager;
  private connectionManager: ConnectionManager;
  private process?: ChildProcess;
  private debugState: DebugState;
  private breakpoints: Map<string, CDPBreakpoint> = new Map();
  private scriptIdToUrl: Map<string, string> = new Map();
  private currentCallFrameId?: string;
  private currentCallFrames?: CDPDebuggerPausedParams['callFrames'];
  private request?: DebugRequest;

  // Event emitter for typed events
  private eventEmitter = new Emittery<DebugSessionEvents>();

  // Legacy callback support (for backward compatibility)
  private consoleHandler?: ConsoleHandler;
  private pauseHandler?: PauseHandler;
  private resumeHandler?: ResumeHandler;
  private breakpointResolvedHandler?: (reg: BreakpointRegistration) => void;

  constructor(options?: NodeDebugAdapterOptions) {
    this.cdpClient = options?.cdpClient || new CDPConnection();
    this.spawner = new ProcessSpawner();
    this.scopeInspector = new ScopeInspector();
    this.sourceMapHandler = new SourceMapHandler();
    this.request = options?.request;
    this.debugState = {
      status: 'terminated',
    };

    // Initialize helper managers
    this.pauseHandlerManager = new PauseHandlerManager(
      this.scriptIdToUrl,
      this.request,
    );
    this.eventHandlersManager = new EventHandlersManager(
      this.cdpClient,
      this.eventEmitter,
      this.sourceMapHandler,
      this.pauseHandlerManager,
      this.breakpoints,
      this.scriptIdToUrl,
      () => this.debugState,
      (state: DebugState) => {
        this.debugState = state;
      },
      (frameId?: string, frames?: CDPDebuggerPausedParams['callFrames']) => {
        this.currentCallFrameId = frameId;
        this.currentCallFrames = frames;
      },
    );
    this.connectionManager = new ConnectionManager(
      this.cdpClient,
      this.spawner,
      this.request,
    );
  }

  async connect(target: string): Promise<void> {
    try {
      // Connect and setup CDP domains
      this.process = await this.connectionManager.connect(target);

      // THEN setup CDP event handlers before running the debugger
      this.eventHandlersManager.setupCDPHandlers(
        this.consoleHandler,
        this.resumeHandler,
        this.breakpointResolvedHandler,
        this.pauseHandler,
      );

      // Finalize the connection
      await this.connectionManager.finalizeConnection();

      // Initial state is running until we get a pause event
      this.debugState = { status: 'running' };
    } catch (error) {
      const adapterError =
        error instanceof Error ? error : new Error(String(error));
      this.eventEmitter.emit('error', adapterError);
      throw adapterError;
    }
  }

  async disconnect(): Promise<void> {
    // Reject any pending pause promises
    const terminationError = new Error('Debug session terminated');
    this.pauseHandlerManager.rejectPendingPromises(terminationError);

    await this.cdpClient.disconnect();
    if (this.process) {
      await this.spawner.kill(this.process);
      this.process = undefined;
    }

    this.debugState = { status: 'terminated' };
    this.breakpoints.clear();
    this.scriptIdToUrl.clear();
    this.currentCallFrameId = undefined;
    this.currentCallFrames = undefined;

    // Cleanup source map handler
    this.sourceMapHandler.destroy();

    // Emit terminated event (fire and forget)
    this.eventEmitter.emit('terminated', undefined).catch((error) => {
      console.error(
        '[NodeDebugAdapter] Error emitting terminated event:',
        error,
      );
    });
  }

  async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    const result = await this.cdpClient.send<CDPBreakpoint>(
      'Debugger.setBreakpointByUrl',
      {
        url: file,
        lineNumber: line - 1, // CDP uses 0-based line numbers
        condition,
      },
    );

    this.breakpoints.set(result.breakpointId, result);

    return {
      id: result.breakpointId,
      verified: result.locations.length > 0,
      resolvedLocations: result.locations.map((loc) => ({
        file,
        line: loc.lineNumber + 1, // Convert back to 1-based
        column: loc.columnNumber,
      })),
    };
  }

  async removeBreakpoint(id: string): Promise<void> {
    await this.cdpClient.send('Debugger.removeBreakpoint', {
      breakpointId: id,
    });
    this.breakpoints.delete(id);
  }

  async continue(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.resume');
    this.debugState = { status: 'running' };
    return this.debugState;
  }

  async stepOver(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.stepOver');
    return this.debugState;
  }

  async stepInto(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.stepInto');
    return this.debugState;
  }

  async stepOut(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.stepOut');
    return this.debugState;
  }

  async evaluate(expression: string): Promise<EvaluationResult> {
    if (this.currentCallFrameId) {
      return this.scopeInspector.evaluateInScope(
        expression,
        this.currentCallFrameId,
        this.cdpClient,
      );
    }

    const result = await this.cdpClient.send<{
      result: {
        type: string;
        value?: unknown;
        description?: string;
      };
      exceptionDetails?: {
        text: string;
      };
    }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      return {
        value: undefined,
        type: 'error',
        error: result.exceptionDetails.text,
      };
    }

    return {
      value: result.result.value,
      type: result.result.type,
      description: result.result.description,
    };
  }

  async getStackTrace(): Promise<StackFrame[]> {
    if (!this.currentCallFrames || this.debugState.status !== 'paused') {
      return [];
    }

    return this.currentCallFrames.map((frame, idx) => ({
      id: idx,
      functionName: frame.functionName || '<anonymous>',
      file:
        frame.url ||
        this.scriptIdToUrl.get(frame.location.scriptId) ||
        'unknown',
      line: frame.location.lineNumber + 1, // Convert to 1-based
      column: frame.location.columnNumber,
      origin: determineCodeOrigin(
        frame.url || this.scriptIdToUrl.get(frame.location.scriptId),
      ),
    }));
  }

  async getScopes(frameId: number): Promise<Scope[]> {
    if (!this.currentCallFrames || !this.currentCallFrames[frameId]) {
      return [];
    }

    const frame = this.currentCallFrames[frameId];
    return this.scopeInspector.inspectScopes(frame.scopeChain, this.cdpClient);
  }

  // Event-driven interface using Emittery
  on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void {
    return this.eventEmitter.on(event, handler);
  }

  off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void {
    this.eventEmitter.off(event, handler);
  }

  // Pause state management
  async waitForPause(timeoutMs = 30000): Promise<DebugState> {
    return this.pauseHandlerManager.waitForPause(timeoutMs, this.debugState);
  }

  getCurrentState(): DebugState {
    return { ...this.debugState };
  }

  // Legacy callback support for backward compatibility (deprecated)
  onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandler = handler;
  }

  onPaused(handler: PauseHandler): void {
    this.pauseHandler = handler;
  }

  onResumed(handler: ResumeHandler): void {
    this.resumeHandler = handler;
  }

  onBreakpointResolved?(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.breakpointResolvedHandler = handler;
  }

  public getSourceMapHandler(): SourceMapHandler {
    return this.sourceMapHandler;
  }
}
