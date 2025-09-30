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
 * Node.js debug adapter implementing Chrome DevTools Protocol (CDP) for debugging.
 *
 * This adapter manages the complete lifecycle of debugging Node.js applications:
 * - Process spawning with inspector flags
 * - WebSocket connection to the Node.js debugger
 * - Breakpoint management and source mapping
 * - Execution control (step, continue, etc.)
 * - Variable inspection and expression evaluation
 * - Console output capture
 *
 * Key features:
 * - Supports TypeScript via source maps
 * - Event-driven architecture using Emittery
 * - Legacy callback compatibility for backward compatibility
 * - Automatic cleanup on termination
 * @example Basic usage
 * ```typescript
 * const adapter = new NodeDebugAdapter({
 *   request: {
 *     platform: 'node',
 *     target: '/path/to/script.js',
 *     breakpoints: [{ file: '/path/to/script.js', line: 10 }]
 *   }
 * });
 * await adapter.connect('/path/to/script.js');
 * await adapter.waitForPause();
 * const frames = await adapter.getStackTrace();
 * await adapter.disconnect();
 * ```
 * @example With custom CDP client (testing)
 * ```typescript
 * const mockCdpClient = createMockCDPClient();
 * const adapter = new NodeDebugAdapter({ cdpClient: mockCdpClient });
 * ```
 * @public
 * @see file:../types/adapter.ts:11 - IDebugAdapter interface
 * @see file:./node/cdp-connection.ts - CDP client implementation
 * @see file:./node/process-spawner.ts - Process launching
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

  /**
   * Creates a new Node.js debug adapter instance.
   *
   * Initializes CDP client, process spawner, scope inspector, source map handler,
   * and various helper managers for handling debug events and state.
   * @param options - Configuration options for the adapter
   * @see file:./node/cdp-connection.ts:15 - CDPConnection default implementation
   * @see file:./node/process-spawner.ts:20 - ProcessSpawner
   * @see file:./node/event-handlers.ts:30 - EventHandlersManager
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
  }

  /**
   * Connects to the Node.js debugger and initializes the debug session.
   *
   * This method performs the following steps:
   * 1. Spawns the Node.js process with inspector flags
   * 2. Establishes WebSocket connection to the CDP endpoint
   * 3. Enables CDP domains (Debugger, Runtime, etc.)
   * 4. Sets up event handlers for pause, resume, console, etc.
   * 5. Transitions state to 'running'
   *
   * The connection process is managed by ConnectionManager and EventHandlersManager
   * to ensure proper initialization order and error handling.
   * @param target - Path to the script to debug (e.g., '/path/to/script.js')
   * @throws {Error} When connection fails or process cannot be spawned
   * @example
   * ```typescript
   * await adapter.connect('./dist/index.js');
   * // Session is now active and will pause at entry or first breakpoint
   * ```
   * @public
   * @see file:./node/connection-manager.ts:25 - ConnectionManager implementation
   * @see file:./node/event-handlers.ts:50 - Event handler setup
   */
  public async connect(target: string): Promise<void> {
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

  /**
   * Disconnects from the debug session and cleans up all resources.
   *
   * This method performs complete teardown:
   * 1. Rejects any pending pause promises with termination error
   * 2. Disconnects CDP client and closes WebSocket
   * 3. Terminates the spawned Node.js process
   * 4. Clears all breakpoints and internal state
   * 5. Destroys source map handler
   * 6. Emits 'terminated' event for listeners
   *
   * Safe to call multiple times - subsequent calls are no-ops.
   * @throws {Error} Errors during cleanup are logged but not thrown to ensure cleanup completes
   * @example
   * ```typescript
   * try {
   *   await adapter.disconnect();
   * } finally {
   *   // Session is fully cleaned up
   * }
   * ```
   * @public
   * @see file:./node/pause-handler.ts:80 - Pause promise rejection
   */
  public async disconnect(): Promise<void> {
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

  /**
   * Sets a breakpoint at the specified file and line.
   *
   * Sends a CDP setBreakpointByUrl command and stores the result. Line numbers
   * use 1-based indexing (human-readable), but are converted to 0-based for CDP.
   *
   * The breakpoint may resolve to multiple locations if the file is loaded multiple
   * times or the line maps to multiple source locations.
   * @param file - Absolute path or URL of the file (e.g., 'file:///path/to/script.js' or '/path/to/script.js')
   * @param line - Line number (1-based) where breakpoint should be set
   * @param condition - Optional conditional expression (breakpoint triggers only when condition is truthy)
   * @returns Promise resolving to breakpoint registration with ID and resolved locations
   * @example
   * ```typescript
   * const bp = await adapter.setBreakpoint('/app/index.js', 42);
   * console.log(`Breakpoint ${bp.id} verified: ${bp.verified}`);
   * ```
   * @example With condition
   * ```typescript
   * const bp = await adapter.setBreakpoint('/app/loop.js', 15, 'i > 100');
   * // Breakpoint only triggers when i > 100
   * ```
   * @public
   * @see file:../types/breakpoint.ts:1 - BreakpointRegistration type
   */
  public async setBreakpoint(
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

  /**
   * Removes a previously set breakpoint by ID.
   * @param id - Breakpoint ID returned from setBreakpoint
   * @example
   * ```typescript
   * const bp = await adapter.setBreakpoint('/app/index.js', 42);
   * await adapter.removeBreakpoint(bp.id);
   * ```
   * @public
   */
  public async removeBreakpoint(id: string): Promise<void> {
    await this.cdpClient.send('Debugger.removeBreakpoint', {
      breakpointId: id,
    });
    this.breakpoints.delete(id);
  }

  /**
   * Resumes execution from a paused state.
   *
   * Sends CDP resume command and transitions internal state to 'running'.
   * Program continues until next breakpoint, exception, or completion.
   * @returns Current debug state after resuming (status: 'running')
   * @example
   * ```typescript
   * await adapter.waitForPause();
   * const state = await adapter.continue();
   * console.log(state.status); // 'running'
   * ```
   * @public
   */
  public async continue(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.resume');
    this.debugState = { status: 'running' };
    return this.debugState;
  }

  /**
   * Steps over the current line (executes current line without stepping into function calls).
   *
   * If the current line contains a function call, the entire call executes and
   * debugger pauses at the next line. State remains unchanged until pause event.
   * @returns Current debug state (typically unchanged until next pause)
   * @public
   */
  public async stepOver(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.stepOver');
    return this.debugState;
  }

  /**
   * Steps into the function call on the current line.
   *
   * If the current line contains a function call, debugger enters that function
   * and pauses at its first statement. If no function call, behaves like stepOver.
   * @returns Current debug state (typically unchanged until next pause)
   * @public
   */
  public async stepInto(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.stepInto');
    return this.debugState;
  }

  /**
   * Steps out of the current function to the calling frame.
   *
   * Resumes execution until the current function returns, then pauses at the
   * return point in the caller. If already at the top level, behaves like continue.
   * @returns Current debug state (typically unchanged until next pause)
   * @public
   */
  public async stepOut(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.stepOut');
    return this.debugState;
  }

  /**
   * Evaluates a JavaScript expression in the current debug context.
   *
   * When paused, evaluates the expression in the context of the current call frame,
   * with access to local variables and scope chain. When running, evaluates in the
   * global context.
   *
   * The expression can access local variables, closure variables, and global objects.
   * Side effects from the expression affect the running program.
   * @param expression - JavaScript expression to evaluate (e.g., 'x + y', 'user.name')
   * @returns Promise resolving to evaluation result with value, type, and optional error
   * @example Evaluating variables
   * ```typescript
   * await adapter.waitForPause();
   * const result = await adapter.evaluate('userCount');
   * console.log(result.value); // e.g., 42
   * ```
   * @example Complex expressions
   * ```typescript
   * const result = await adapter.evaluate('users.filter(u => u.active).length');
   * if (result.type !== 'error') {
   *   console.log(`Active users: ${result.value}`);
   * }
   * ```
   * @public
   * @see file:./node/scope-inspector.ts:45 - Scope evaluation implementation
   */
  public async evaluate(expression: string): Promise<EvaluationResult> {
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

  /**
   * Retrieves the current call stack when debugger is paused.
   *
   * Returns an empty array if not paused or if no frames are available.
   * Each frame includes function name, file location, line/column numbers,
   * and code origin classification (user vs node_modules vs node internals).
   *
   * Frame IDs are array indices (0-based), with 0 being the current frame.
   * @returns Promise resolving to array of stack frames (empty if not paused)
   * @example
   * ```typescript
   * await adapter.waitForPause();
   * const frames = await adapter.getStackTrace();
   * frames.forEach((frame, i) => {
   *   console.log(`${i}: ${frame.functionName} at ${frame.file}:${frame.line}`);
   * });
   * ```
   * @public
   * @see file:../types/evaluation.ts:20 - StackFrame type
   * @see file:./node/code-origin.ts:15 - Code origin classification
   */
  public async getStackTrace(): Promise<StackFrame[]> {
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

  /**
   * Retrieves variable scopes for a specific stack frame.
   *
   * Returns scopes in order from innermost to outermost (local, closure, global).
   * Each scope contains variable names and their values. Only available when paused.
   * @param frameId - Stack frame index (0 = current frame, from getStackTrace)
   * @returns Promise resolving to array of scopes with variables (empty if frame not found or not paused)
   * @example
   * ```typescript
   * await adapter.waitForPause();
   * const scopes = await adapter.getScopes(0); // Current frame
   * scopes.forEach(scope => {
   *   console.log(`${scope.type}: ${Object.keys(scope.variables).join(', ')}`);
   * });
   * ```
   * @public
   * @see file:../types/evaluation.ts:30 - Scope type
   * @see file:./node/scope-inspector.ts:60 - Scope inspection implementation
   */
  public async getScopes(frameId: number): Promise<Scope[]> {
    if (!this.currentCallFrames || !this.currentCallFrames[frameId]) {
      return [];
    }

    const frame = this.currentCallFrames[frameId];
    return this.scopeInspector.inspectScopes(frame.scopeChain, this.cdpClient);
  }

  /**
   * Registers an event handler for debug session events.
   *
   * Supports type-safe event handling via Emittery. Available events include:
   * - 'paused': Debugger paused (breakpoint, step, exception)
   * - 'resumed': Execution resumed
   * - 'console': Console output (log, warn, error)
   * - 'terminated': Session ended
   * - 'error': Error during debugging
   * - 'breakpointResolved': Breakpoint successfully set
   * @param event - Event name to listen for
   * @param handler - Callback function receiving event-specific data
   * @returns Unsubscribe function to remove the handler
   * @example
   * ```typescript
   * const unsubscribe = adapter.on('paused', (state) => {
   *   console.log(`Paused at ${state.location?.file}:${state.location?.line}`);
   * });
   * // Later: unsubscribe();
   * ```
   * @public
   * @see file:../types/events.ts:15 - DebugSessionEvents type
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
   * @param handler - Handler function to remove (must be same reference as passed to on())
   * @example
   * ```typescript
   * const handler = (state) => console.log(state);
   * adapter.on('paused', handler);
   * adapter.off('paused', handler); // Removes specific handler
   * ```
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
   *
   * This method blocks until a pause event occurs or the timeout expires.
   * Useful for synchronizing execution flow after stepping or continuing.
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000)
   * @returns Promise resolving to debug state when paused
   * @throws {Error} When timeout expires before pause occurs
   * @example
   * ```typescript
   * await adapter.continue();
   * const state = await adapter.waitForPause(5000);
   * console.log(`Paused at ${state.location?.line}`);
   * ```
   * @public
   * @see file:./node/pause-handler.ts:120 - Pause promise management
   */
  public async waitForPause(timeoutMs = 30000): Promise<DebugState> {
    return this.pauseHandlerManager.waitForPause(timeoutMs, this.debugState);
  }

  /**
   * Retrieves the current debug state snapshot.
   *
   * Returns a copy of the internal state to prevent external mutations.
   * State includes status ('running', 'paused', 'terminated') and optional
   * pause location information.
   * @returns Current debug state (copy, not live reference)
   * @example
   * ```typescript
   * const state = adapter.getCurrentState();
   * if (state.status === 'paused') {
   *   console.log(`Paused at ${state.location?.file}:${state.location?.line}`);
   * }
   * ```
   * @public
   */
  public getCurrentState(): DebugState {
    return { ...this.debugState };
  }

  /**
   * Registers a legacy callback for console output events.
   * @param handler - Callback receiving console messages
   * @deprecated Use `on('console', handler)` instead for type-safe event handling
   * @example Migration path
   * ```typescript
   * // Old way:
   * adapter.onConsoleOutput((msg) => console.log(msg));
   * // New way:
   * adapter.on('console', (msg) => console.log(msg));
   * ```
   * @public
   */
  public onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandler = handler;
  }

  /**
   * Registers a legacy callback for pause events.
   * @param handler - Callback receiving debug state when paused
   * @deprecated Use `on('paused', handler)` instead for type-safe event handling
   * @public
   */
  public onPaused(handler: PauseHandler): void {
    this.pauseHandler = handler;
  }

  /**
   * Registers a legacy callback for resume events.
   * @param handler - Callback invoked when execution resumes
   * @deprecated Use `on('resumed', handler)` instead for type-safe event handling
   * @public
   */
  public onResumed(handler: ResumeHandler): void {
    this.resumeHandler = handler;
  }

  /**
   * Registers a legacy callback for breakpoint resolution events.
   * @param handler - Callback receiving breakpoint registration details
   * @deprecated Use `on('breakpointResolved', handler)` instead for type-safe event handling
   * @public
   */
  public onBreakpointResolved?(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.breakpointResolvedHandler = handler;
  }

  /**
   * Retrieves the source map handler for TypeScript debugging.
   *
   * Provides access to source map resolution for mapping transpiled code locations
   * back to original TypeScript source files. Used internally by the adapter and
   * exposed for advanced use cases.
   * @returns Source map handler instance
   * @example
   * ```typescript
   * const handler = adapter.getSourceMapHandler();
   * const original = await handler.mapToOriginal('/dist/index.js', 10, 5);
   * console.log(original); // { source: '/src/index.ts', line: 15, column: 8 }
   * ```
   * @public
   * @see file:./node/source-map-handler.ts:25 - SourceMapHandler implementation
   */
  public getSourceMapHandler(): SourceMapHandler {
    return this.sourceMapHandler;
  }
}
