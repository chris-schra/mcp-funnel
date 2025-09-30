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
  ExecutionControlManager,
  BreakpointManager,
  InspectionManager,
  LegacyCallbackStorage,
  SessionLifecycleManager,
} from './node/index.js';

/**
 * Configuration options for NodeDebugAdapter initialization
 * @public
 * @see file:./node-adapter.ts:37 - NodeDebugAdapter usage
 */
type NodeDebugAdapterOptions = {
  /** Optional CDP client for testing or custom implementations */
  cdpClient?: ITypedCDPClient;
  /** Debug request containing platform, target, and execution options */
  request?: DebugRequest;
};

/**
 * Node.js debug adapter implementing Chrome DevTools Protocol (CDP).
 *
 * Manages debugging lifecycle via delegation to specialized helper managers.
 * Supports TypeScript via source maps, event-driven architecture, and legacy callbacks.
 * @public
 * @see file:../types/adapter.ts:11 - IDebugAdapter interface
 */
export class NodeDebugAdapter implements IDebugAdapter {
  private cdpClient: ITypedCDPClient;
  private spawner: ProcessSpawner;
  private scopeInspector: ScopeInspector;
  protected sourceMapHandler: SourceMapHandler;
  private pauseHandlerManager: PauseHandlerManager;
  private eventHandlersManager: EventHandlersManager;
  private connectionManager: ConnectionManager;
  private executionControlManager: ExecutionControlManager;
  private breakpointManager: BreakpointManager;
  private inspectionManager: InspectionManager;
  private legacyCallbacks: LegacyCallbackStorage;
  private sessionLifecycleManager: SessionLifecycleManager;
  private process?: ChildProcess;
  private debugState: DebugState;
  private breakpoints: Map<string, CDPBreakpoint> = new Map();
  private scriptIdToUrl: Map<string, string> = new Map();
  private currentCallFrameId?: string;
  private currentCallFrames?: CDPDebuggerPausedParams['callFrames'];
  private request?: DebugRequest;

  // Event emitter for typed events
  private eventEmitter = new Emittery<DebugSessionEvents>();

  /**
   * Creates a new Node.js debug adapter instance.
   * @param options - Configuration options for the adapter
   */
  public constructor(options?: NodeDebugAdapterOptions) {
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
    this.executionControlManager = new ExecutionControlManager(
      this.cdpClient,
      this.pauseHandlerManager,
      () => this.debugState,
      (state: DebugState) => {
        this.debugState = state;
      },
    );
    this.breakpointManager = new BreakpointManager(
      this.cdpClient,
      this.breakpoints,
    );
    this.inspectionManager = new InspectionManager(
      this.cdpClient,
      this.scopeInspector,
      this.scriptIdToUrl,
      () => this.currentCallFrameId,
      () => this.currentCallFrames,
      () => this.debugState,
    );
    this.legacyCallbacks = new LegacyCallbackStorage();
    this.sessionLifecycleManager = new SessionLifecycleManager(
      this.connectionManager,
      this.eventHandlersManager,
      this.pauseHandlerManager,
      this.breakpointManager,
      this.spawner,
      this.sourceMapHandler,
      this.eventEmitter,
      this.legacyCallbacks,
      () => this.debugState,
      (state: DebugState) => {
        this.debugState = state;
      },
      () => this.cdpClient,
      () => this.scriptIdToUrl,
      (process: ChildProcess | undefined) => {
        this.process = process;
      },
      () => this.process,
      () => {
        this.currentCallFrameId = undefined;
        this.currentCallFrames = undefined;
      },
    );
  }

  /**
   * Connects to the Node.js debugger and initializes the debug session.
   * @param target - Path to the script to debug
   * @returns Promise that resolves when connection is established
   * @throws When connection fails or process cannot be spawned
   * @public
   * @see file:./node/session-lifecycle-manager.ts:70 - Implementation
   */
  public async connect(target: string): Promise<void> {
    return this.sessionLifecycleManager.connect(target);
  }

  /**
   * Disconnects from the debug session and cleans up all resources.
   * @returns Promise that resolves when disconnection is complete
   * @public
   * @see file:./node/session-lifecycle-manager.ts:120 - Implementation
   */
  public async disconnect(): Promise<void> {
    return this.sessionLifecycleManager.disconnect();
  }

  /**
   * Sets a breakpoint at the specified file and line.
   *
   * Delegates to BreakpointManager for implementation.
   * @param file - Absolute path or URL of the file
   * @param line - Line number (1-based)
   * @param condition - Optional conditional expression
   * @returns Promise resolving to breakpoint registration
   * @public
   * @see file:./node/breakpoint-manager.ts:35 - Implementation
   */
  public async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    return this.breakpointManager.setBreakpoint(file, line, condition);
  }

  /**
   * Removes a previously set breakpoint by ID.
   * @param id - Breakpoint ID returned from setBreakpoint
   * @returns Promise that resolves when breakpoint is removed
   * @public
   * @see file:./node/breakpoint-manager.ts:80 - Implementation
   */
  public async removeBreakpoint(id: string): Promise<void> {
    return this.breakpointManager.removeBreakpoint(id);
  }

  /**
   * Resumes execution from a paused state.
   * @returns Current debug state after resuming
   * @public
   * @see file:./node/execution-control-manager.ts:35 - Implementation
   */
  public async continue(): Promise<DebugState> {
    return this.executionControlManager.continue();
  }

  /**
   * Steps over the current line.
   * @returns Current debug state
   * @public
   * @see file:./node/execution-control-manager.ts:57 - Implementation
   */
  public async stepOver(): Promise<DebugState> {
    return this.executionControlManager.stepOver();
  }

  /**
   * Steps into the function call on the current line.
   * @returns Current debug state
   * @public
   * @see file:./node/execution-control-manager.ts:72 - Implementation
   */
  public async stepInto(): Promise<DebugState> {
    return this.executionControlManager.stepInto();
  }

  /**
   * Steps out of the current function.
   * @returns Current debug state
   * @public
   * @see file:./node/execution-control-manager.ts:85 - Implementation
   */
  public async stepOut(): Promise<DebugState> {
    return this.executionControlManager.stepOut();
  }

  /**
   * Evaluates a JavaScript expression in the current debug context.
   * @param expression - JavaScript expression to evaluate
   * @returns Promise resolving to evaluation result
   * @public
   * @see file:./node/inspection-manager.ts:50 - Implementation
   */
  public async evaluate(expression: string): Promise<EvaluationResult> {
    return this.inspectionManager.evaluate(expression);
  }

  /**
   * Retrieves the current call stack when debugger is paused.
   * @returns Promise resolving to array of stack frames
   * @public
   * @see file:./node/inspection-manager.ts:105 - Implementation
   */
  public async getStackTrace(): Promise<StackFrame[]> {
    return this.inspectionManager.getStackTrace();
  }

  /**
   * Retrieves variable scopes for a specific stack frame.
   * @param frameId - Stack frame index (0 = current frame)
   * @returns Promise resolving to array of scopes with variables
   * @public
   * @see file:./node/inspection-manager.ts:145 - Implementation
   */
  public async getScopes(frameId: number): Promise<Scope[]> {
    return this.inspectionManager.getScopes(frameId);
  }

  /**
   * Registers an event handler for debug session events.
   * @param event - Event name to listen for
   * @param handler - Callback function receiving event-specific data
   * @returns Unsubscribe function to remove the handler
   * @public
   */
  public on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void {
    return this.eventEmitter.on(event, handler);
  }

  /**
   * Removes a previously registered event handler.
   * @param event - Event name to unsubscribe from
   * @param handler - Handler function to remove
   * @public
   */
  public off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void {
    this.eventEmitter.off(event, handler);
  }

  /**
   * Waits for the debugger to pause (at breakpoint, step, or exception).
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000)
   * @returns Promise resolving to debug state when paused
   * @public
   * @see file:./node/execution-control-manager.ts:98 - Implementation
   */
  public async waitForPause(timeoutMs = 30000): Promise<DebugState> {
    return this.executionControlManager.waitForPause(timeoutMs);
  }

  /**
   * Retrieves the current debug state snapshot.
   * @returns Current debug state (copy, not live reference)
   * @public
   */
  public getCurrentState(): DebugState {
    return { ...this.debugState };
  }

  /**
   * Registers a legacy callback for console output events.
   * @param handler - Callback receiving console messages
   * @deprecated Use `on('console', handler)` instead
   * @public
   * @see file:./node/legacy-callbacks.ts:60 - Implementation
   */
  public onConsoleOutput(handler: ConsoleHandler): void {
    this.legacyCallbacks.setConsoleHandler(handler);
  }

  /**
   * Registers a legacy callback for pause events.
   * @param handler - Callback receiving debug state when paused
   * @deprecated Use `on('paused', handler)` instead
   * @public
   * @see file:./node/legacy-callbacks.ts:73 - Implementation
   */
  public onPaused(handler: PauseHandler): void {
    this.legacyCallbacks.setPauseHandler(handler);
  }

  /**
   * Registers a legacy callback for resume events.
   * @param handler - Callback invoked when execution resumes
   * @deprecated Use `on('resumed', handler)` instead
   * @public
   * @see file:./node/legacy-callbacks.ts:84 - Implementation
   */
  public onResumed(handler: ResumeHandler): void {
    this.legacyCallbacks.setResumeHandler(handler);
  }

  /**
   * Registers a legacy callback for breakpoint resolution events.
   * @param handler - Callback receiving breakpoint registration details
   * @deprecated Use `on('breakpointResolved', handler)` instead
   * @public
   * @see file:./node/legacy-callbacks.ts:95 - Implementation
   */
  public onBreakpointResolved?(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.legacyCallbacks.setBreakpointResolvedHandler(handler);
  }

  /**
   * Retrieves the source map handler for TypeScript debugging.
   * @returns Source map handler instance
   * @public
   */
  public getSourceMapHandler(): SourceMapHandler {
    return this.sourceMapHandler;
  }
}
