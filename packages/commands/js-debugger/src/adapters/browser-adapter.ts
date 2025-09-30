import Emittery from 'emittery';
import {
  IDebugAdapter,
  DebugState,
  StackFrame,
  Scope,
  EvaluationResult,
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
  BreakpointRegistration,
  DebugRequest,
  DebugSessionEvents,
} from '../types/index.js';
import { CDPClient, CDPCallFrame } from '../cdp/index.js';
import { deriveProjectRootFromRequest } from '../utils/locations.js';
import { PageManager } from './browser/page-manager.js';
import { BrowserConsoleHandler } from './browser/console-handler.js';
import { BrowserEventHandlers } from './browser/event-handlers.js';
import { BreakpointManager } from './browser/breakpoint-manager.js';
import { ExecutionControl } from './browser/execution-control.js';
import {
  filePathToUrl,
  buildStackTrace,
  getFrameScopes,
} from './browser/utils.js';
import type { ScriptInfo } from './browser/handlers/script-handler.js';

/**
 * Configuration options for BrowserAdapter initialization.
 * @public
 */
type BrowserAdapterOptions = {
  /** Chrome DevTools Protocol host address (defaults to 'localhost') */
  host?: string;
  /** Chrome DevTools Protocol port (defaults to 9222) */
  port?: number;
  /** Debug request containing platform-specific configuration */
  request?: DebugRequest;
};

/**
 * Browser debugging adapter using Chrome DevTools Protocol (CDP).
 *
 * Provides a unified interface for debugging JavaScript in Chrome, Edge, and other
 * Chromium-based browsers. Handles connection management, breakpoint operations,
 * execution control (step/continue), and real-time event notifications.
 *
 * Key capabilities:
 * - Connect to remote debugging targets via CDP WebSocket
 * - Set/remove breakpoints with optional conditions
 * - Control execution flow (continue, step over/into/out)
 * - Evaluate expressions in paused contexts
 * - Inspect stack frames and variable scopes
 * - Capture console output and exceptions
 * - Event-driven architecture using Emittery
 * @example Basic usage
 * ```typescript
 * const adapter = new BrowserAdapter({ host: 'localhost', port: 9222 });
 * await adapter.connect('http://localhost:3000');
 * await adapter.setBreakpoint('script.js', 10);
 * await adapter.continue();
 * const state = adapter.getCurrentState();
 * await adapter.disconnect();
 * ```
 * @example With event handling
 * ```typescript
 * const adapter = new BrowserAdapter();
 * adapter.on('paused', (state) => console.log('Paused at:', state.location));
 * adapter.on('console', (msg) => console.log('Console:', msg.message));
 * await adapter.connect('page-url');
 * ```
 * @public
 * @see file:../types/adapter.ts - IDebugAdapter interface
 * @see file:./browser/page-manager.ts - Browser target discovery
 * @see file:../cdp/client.ts - CDP client implementation
 */
export class BrowserAdapter implements IDebugAdapter {
  private cdpClient: CDPClient;
  private pageManager: PageManager;
  private consoleHandler: BrowserConsoleHandler;
  private eventHandlers: BrowserEventHandlers;
  private breakpointManager: BreakpointManager;
  private executionControl: ExecutionControl;
  private isConnected = false;
  private scripts = new Map<string, ScriptInfo>();
  private currentCallFrames: CDPCallFrame[] = [];
  private debugState: DebugState = { status: 'running' };
  private projectRoot?: string;

  // Event emitter for typed events
  private eventEmitter = new Emittery<DebugSessionEvents>();

  // Pause state management
  private pausePromises = new Set<{
    resolve: (state: DebugState) => void;
    reject: (error: Error) => void;
    timeout?: NodeJS.Timeout;
  }>();

  /**
   * Creates a new browser debugging adapter instance.
   *
   * Initializes CDP client, page manager, and event handling infrastructure.
   * Does not establish a connection - call connect() to attach to a target.
   * @param options - Configuration for host, port, and debug request
   */
  constructor(options?: BrowserAdapterOptions) {
    const host = options?.host ?? 'localhost';
    const port = options?.port ?? 9222;

    this.cdpClient = new CDPClient();
    this.pageManager = new PageManager(host, port);
    this.consoleHandler = new BrowserConsoleHandler(this.eventEmitter);
    this.projectRoot = deriveProjectRootFromRequest(options?.request);

    this.breakpointManager = new BreakpointManager(
      this.cdpClient,
      this.scripts,
      this.projectRoot,
    );

    this.eventHandlers = new BrowserEventHandlers(
      this.cdpClient,
      this.eventEmitter,
      this.consoleHandler,
      this.scripts,
      this.breakpointManager.getBreakpoints(),
      this.debugState,
      this.pausePromises,
      this.currentCallFrames,
      this.projectRoot,
      (state: DebugState) => {
        this.debugState = state;
      },
    );

    this.executionControl = new ExecutionControl(
      this.cdpClient,
      this.eventHandlers,
    );

    this.eventHandlers.setupEventHandlers();
  }

  /**
   * Connects to a browser debugging target.
   *
   * Discovers the CDP WebSocket URL for the target (by URL or page title),
   * establishes connection, and enables required CDP domains (Runtime, Debugger,
   * Console, Page). Sets pause-on-uncaught-exceptions by default.
   * @param target - URL of the page to debug (e.g., 'http://localhost:3000') or page title pattern
   * @throws {Error} When already connected to a target
   * @throws {Error} When target cannot be found or connection fails
   */
  async connect(target: string): Promise<void> {
    if (this.isConnected) {
      throw new Error('Already connected to a debugging target');
    }

    const browserTarget = await this.pageManager.findTarget(target);
    await this.cdpClient.connect(browserTarget.webSocketDebuggerUrl);
    await this.enableCDPDomains();

    this.isConnected = true;
    this.debugState = { status: 'running' };
  }

  /**
   * Disconnects from the debugging target and cleans up resources.
   *
   * Rejects pending pause promises, disables CDP domains, closes WebSocket
   * connection, and emits 'terminated' event. Safe to call multiple times.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    this.rejectPendingPausePromises();
    await this.disableCDPDomains();
    await this.cdpClient.disconnect();
    this.resetState();
    this.eventEmitter.emit('terminated', undefined);
  }

  /**
   * Navigates the connected page to a new URL.
   * @param url - Absolute URL to navigate to
   * @throws {Error} When not connected to a debugging target
   */
  async navigate(url: string): Promise<void> {
    this.ensureConnected();
    await this.pageManager.navigate(this.cdpClient, url);
  }

  /**
   * Sets a breakpoint at the specified location.
   *
   * Converts file path to URL format, registers with CDP, and emits
   * 'breakpointResolved' event when verified. Breakpoint may be pending
   * if the script hasn't loaded yet.
   * @param file - File path or URL of the script
   * @param line - Line number (1-based)
   * @param condition - Optional conditional expression (breakpoint triggers only when true)
   * @returns Registration info including verification status and resolved locations
   * @throws {Error} When not connected to a debugging target
   */
  async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    this.ensureConnected();
    const url = filePathToUrl(file);
    const registration = await this.breakpointManager.setBreakpoint(
      url,
      line,
      condition,
    );

    if (registration.verified) {
      this.eventEmitter.emit('breakpointResolved', registration);
    }

    return registration;
  }

  /**
   * Removes a previously set breakpoint.
   * @param id - Breakpoint identifier from BreakpointRegistration
   * @throws {Error} When not connected to a debugging target
   */
  async removeBreakpoint(id: string): Promise<void> {
    this.ensureConnected();
    await this.breakpointManager.removeBreakpoint(id);
  }

  /**
   * Resumes execution from paused state.
   *
   * Execution continues until next breakpoint, exception, or program termination.
   * Updates internal state and emits 'resumed' event.
   * @returns Updated debug state (typically status: 'running')
   * @throws {Error} When not connected to a debugging target
   */
  async continue(): Promise<DebugState> {
    this.ensureConnected();
    this.debugState = await this.executionControl.continue();
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  /**
   * Steps over the current statement (executes without entering function calls).
   *
   * Advances to the next statement in the current function. Function calls
   * are executed in their entirety without pausing.
   * @returns Updated debug state after stepping
   * @throws {Error} When not connected to a debugging target
   */
  async stepOver(): Promise<DebugState> {
    this.ensureConnected();
    this.debugState = await this.executionControl.stepOver(this.debugState);
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  /**
   * Steps into the current statement (enters function calls).
   *
   * If the current statement contains a function call, execution pauses
   * at the first statement inside that function.
   * @returns Updated debug state after stepping
   * @throws {Error} When not connected to a debugging target
   */
  async stepInto(): Promise<DebugState> {
    this.ensureConnected();
    this.debugState = await this.executionControl.stepInto(this.debugState);
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  /**
   * Steps out of the current function (returns to caller).
   *
   * Execution continues until the current function returns, then pauses
   * at the statement following the function call.
   * @returns Updated debug state after stepping
   * @throws {Error} When not connected to a debugging target
   */
  async stepOut(): Promise<DebugState> {
    this.ensureConnected();
    this.debugState = await this.executionControl.stepOut(this.debugState);
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  /**
   * Evaluates a JavaScript expression in the current paused context.
   *
   * Has access to local variables, closure scope, and global objects at the
   * current execution point. Only works when debugger is paused.
   * @param expression - JavaScript expression to evaluate
   * @returns Evaluation result with value, type, and optional error
   * @throws {Error} When not connected to a debugging target
   */
  async evaluate(expression: string): Promise<EvaluationResult> {
    this.ensureConnected();
    return await this.executionControl.evaluate(
      expression,
      this.currentCallFrames,
    );
  }

  /**
   * Retrieves the current call stack when debugger is paused.
   *
   * Stack frames include function names, file locations, and line numbers.
   * Returns empty array when not paused or not connected.
   * @returns Array of stack frames from innermost (current) to outermost (program entry)
   */
  async getStackTrace(): Promise<StackFrame[]> {
    if (!this.isConnected || this.debugState.status !== 'paused') {
      return [];
    }

    return buildStackTrace(this.currentCallFrames, this.projectRoot);
  }

  /**
   * Retrieves variable scopes for a specific stack frame.
   *
   * Returns local variables, closure variables, and global scope for the frame.
   * Only available when debugger is paused.
   * @param frameId - Zero-based frame index from getStackTrace()
   * @returns Array of scopes (local, closure, global) with their variables
   */
  async getScopes(frameId: number): Promise<Scope[]> {
    if (!this.isConnected || frameId >= this.currentCallFrames.length) {
      return [];
    }

    const frame = this.currentCallFrames[frameId];
    return getFrameScopes(this.cdpClient, frame);
  }

  /**
   * Registers a handler for console output events.
   * @param handler - Callback receiving console messages
   * @deprecated Use on('console', handler) instead for event-driven approach
   */
  onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandler.onConsoleOutput(handler);
  }

  /**
   * Registers a handler for pause events.
   * @param handler - Callback receiving debug state when execution pauses
   * @deprecated Use on('paused', handler) instead for event-driven approach
   */
  onPaused(handler: PauseHandler): void {
    this.eventHandlers.onPaused(handler);
  }

  /**
   * Registers a handler for resume events.
   * @param handler - Callback invoked when execution resumes
   * @deprecated Use on('resumed', handler) instead for event-driven approach
   */
  onResumed(handler: ResumeHandler): void {
    this.eventHandlers.onResumed(handler);
  }

  /**
   * Registers a handler for breakpoint resolution events.
   * @param handler - Callback receiving registration info when breakpoints are verified
   * @deprecated Use on('breakpointResolved', handler) instead for event-driven approach
   */
  onBreakpointResolved(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.eventHandlers.onBreakpointResolved(handler);
  }

  /**
   * Registers a type-safe event handler for debug session events.
   *
   * Available events:
   * - 'paused': Execution paused (breakpoint, step, exception)
   * - 'resumed': Execution resumed
   * - 'console': Console output captured
   * - 'terminated': Debug session ended
   * - 'breakpointResolved': Breakpoint verified by runtime
   * - 'error': Error occurred during debugging
   * @param event - Event name from DebugSessionEvents
   * @param handler - Type-safe callback for the specific event
   * @returns Unsubscribe function to remove the handler
   * @example
   * ```typescript
   * const unsubscribe = adapter.on('paused', (state) => {
   *   console.log('Paused:', state.pauseReason);
   * });
   * // Later: unsubscribe();
   * ```
   */
  on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void {
    return this.eventEmitter.on(event, handler);
  }

  /**
   * Removes a previously registered event handler.
   * @param event - Event name from DebugSessionEvents
   * @param handler - Handler function to remove (must be same reference as registered)
   */
  off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void {
    this.eventEmitter.off(event, handler);
  }

  /**
   * Waits for the debugger to pause (from any cause).
   *
   * Resolves immediately if already paused, otherwise waits for next pause event
   * from breakpoint, step operation, exception, or debugger statement.
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000)
   * @returns Debug state when paused
   * @throws {Error} When timeout expires before pause occurs
   */
  async waitForPause(timeoutMs = 30000): Promise<DebugState> {
    if (this.debugState.status === 'paused') {
      return this.debugState;
    }

    return new Promise<DebugState>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pausePromises.delete(promiseInfo);
        reject(new Error(`waitForPause timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const promiseInfo = { resolve, reject, timeout };
      this.pausePromises.add(promiseInfo);
    });
  }

  /**
   * Returns a snapshot of the current debug state.
   *
   * State includes execution status (running/paused/terminated), pause reason,
   * current location, and exception info if applicable.
   * @returns Copy of current debug state (safe to modify)
   */
  getCurrentState(): DebugState {
    return { ...this.debugState };
  }

  /**
   * Enables required CDP domains for debugging.
   * @internal
   */
  private async enableCDPDomains(): Promise<void> {
    await Promise.all([
      this.cdpClient.send('Runtime.enable'),
      this.cdpClient.send('Debugger.enable'),
      this.cdpClient.send('Console.enable'),
      this.cdpClient.send('Page.enable'),
    ]);

    await this.cdpClient.send('Debugger.setPauseOnExceptions', {
      state: 'uncaught',
    });
  }

  /**
   * Disables CDP domains during cleanup.
   * @internal
   */
  private async disableCDPDomains(): Promise<void> {
    try {
      await Promise.all([
        this.cdpClient.send('Debugger.disable'),
        this.cdpClient.send('Runtime.disable'),
        this.cdpClient.send('Console.disable'),
        this.cdpClient.send('Page.disable'),
      ]);
    } catch (_error) {
      // Ignore errors during cleanup
    }
  }

  /**
   * Rejects all pending waitForPause promises during disconnect.
   * @internal
   */
  private rejectPendingPausePromises(): void {
    const terminationError = new Error('Debug session terminated');
    Array.from(this.pausePromises).forEach((promise) => {
      if (promise.timeout) clearTimeout(promise.timeout);
      promise.reject(terminationError);
    });
    this.pausePromises.clear();
  }

  /**
   * Resets adapter state after disconnection.
   * @internal
   */
  private resetState(): void {
    this.isConnected = false;
    this.pageManager.clearTarget();
    this.scripts.clear();
    this.breakpointManager.clearBreakpoints();
    this.currentCallFrames = [];
    this.debugState = { status: 'terminated' };
  }

  /**
   * Throws error if not connected to a debugging target.
   * @internal
   */
  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }
  }
}
