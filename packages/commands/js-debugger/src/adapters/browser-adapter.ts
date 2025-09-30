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
import {
  enableCDPDomains,
  disableCDPDomains,
  rejectPendingPausePromises,
  resetAdapterState,
  ensureConnected,
  createWaitForPausePromise,
  type PausePromiseInfo,
} from './browser/connection-lifecycle.js';
import { createAdapterComponents } from './browser/adapter-factory.js';

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
 * Provides unified interface for debugging JavaScript in Chromium-based browsers.
 * Supports breakpoints, execution control, expression evaluation, and event notifications.
 * @example
 * ```typescript
 * const adapter = new BrowserAdapter({ host: 'localhost', port: 9222 });
 * await adapter.connect('http://localhost:3000');
 * adapter.on('paused', (state) => console.log('Paused:', state.pauseReason));
 * await adapter.setBreakpoint('script.js', 10);
 * await adapter.continue();
 * await adapter.disconnect();
 * ```
 * @public
 * @see file:../types/adapter.ts - IDebugAdapter interface
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
  private pausePromises = new Set<PausePromiseInfo>();

  /**
   * Creates a new browser debugging adapter instance.
   *
   * Initializes CDP client, page manager, and event handling infrastructure.
   * Does not establish a connection - call connect() to attach to a target.
   * @param options - Configuration for host, port, and debug request
   */
  public constructor(options?: BrowserAdapterOptions) {
    const host = options?.host ?? 'localhost';
    const port = options?.port ?? 9222;

    const components = createAdapterComponents(
      host,
      port,
      options?.request,
      this.scripts,
      this.debugState,
      this.pausePromises,
      this.currentCallFrames,
      (state: DebugState) => {
        this.debugState = state;
      },
    );

    this.cdpClient = components.cdpClient;
    this.pageManager = components.pageManager;
    this.consoleHandler = components.consoleHandler;
    this.eventHandlers = components.eventHandlers;
    this.breakpointManager = components.breakpointManager;
    this.executionControl = components.executionControl;
    this.eventEmitter = components.eventEmitter;
    this.projectRoot = components.projectRoot;
  }

  /**
   * Connects to a browser debugging target via CDP.
   * @param target - Page URL or title pattern to debug
   * @throws \{Error\} When already connected or target not found
   */
  public async connect(target: string): Promise<void> {
    if (this.isConnected) {
      throw new Error('Already connected to a debugging target');
    }

    const browserTarget = await this.pageManager.findTarget(target);
    await this.cdpClient.connect(browserTarget.webSocketDebuggerUrl);
    await enableCDPDomains(this.cdpClient);

    this.isConnected = true;
    this.debugState = { status: 'running' };
  }

  /**
   * Disconnects from debugging target and cleans up resources.
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    rejectPendingPausePromises(this.pausePromises);
    await disableCDPDomains(this.cdpClient);
    await this.cdpClient.disconnect();
    this.resetState();
    this.eventEmitter.emit('terminated', undefined);
  }

  /**
   * Navigates the connected page to a new URL.
   * @param url - Absolute URL to navigate to
   * @throws \{Error\} When not connected to a debugging target
   */
  public async navigate(url: string): Promise<void> {
    ensureConnected(this.isConnected);
    await this.pageManager.navigate(this.cdpClient, url);
  }

  /**
   * Sets a breakpoint at the specified location.
   * @param file - File path or URL of the script
   * @param line - Line number (1-based)
   * @param condition - Optional conditional expression
   * @returns Registration info with verification status
   * @throws \{Error\} When not connected
   */
  public async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    ensureConnected(this.isConnected);
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
   * @throws \{Error\} When not connected to a debugging target
   */
  public async removeBreakpoint(id: string): Promise<void> {
    ensureConnected(this.isConnected);
    await this.breakpointManager.removeBreakpoint(id);
  }

  /**
   * Resumes execution from paused state.
   * @returns Updated debug state
   * @throws \{Error\} When not connected
   */
  public async continue(): Promise<DebugState> {
    ensureConnected(this.isConnected);
    this.debugState = await this.executionControl.continue();
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  /**
   * Steps over the current statement without entering function calls.
   * @returns Updated debug state
   * @throws \{Error\} When not connected
   */
  public async stepOver(): Promise<DebugState> {
    ensureConnected(this.isConnected);
    this.debugState = await this.executionControl.stepOver(this.debugState);
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  /**
   * Steps into the current statement, entering function calls.
   * @returns Updated debug state
   * @throws \{Error\} When not connected
   */
  public async stepInto(): Promise<DebugState> {
    ensureConnected(this.isConnected);
    this.debugState = await this.executionControl.stepInto(this.debugState);
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  /**
   * Steps out of the current function to the caller.
   * @returns Updated debug state
   * @throws \{Error\} When not connected
   */
  public async stepOut(): Promise<DebugState> {
    ensureConnected(this.isConnected);
    this.debugState = await this.executionControl.stepOut(this.debugState);
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  /**
   * Evaluates a JavaScript expression in the current paused context.
   * @param expression - JavaScript expression to evaluate
   * @returns Evaluation result with value and type
   * @throws \{Error\} When not connected
   */
  public async evaluate(expression: string): Promise<EvaluationResult> {
    ensureConnected(this.isConnected);
    return await this.executionControl.evaluate(
      expression,
      this.currentCallFrames,
    );
  }

  /**
   * Retrieves the current call stack when debugger is paused.
   * @returns Array of stack frames (innermost to outermost)
   */
  public async getStackTrace(): Promise<StackFrame[]> {
    if (!this.isConnected || this.debugState.status !== 'paused') {
      return [];
    }

    return buildStackTrace(this.currentCallFrames, this.projectRoot);
  }

  /**
   * Retrieves variable scopes for a specific stack frame.
   * @param frameId - Zero-based frame index from getStackTrace()
   * @returns Array of scopes with variables
   */
  public async getScopes(frameId: number): Promise<Scope[]> {
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
  public onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandler.onConsoleOutput(handler);
  }

  /**
   * Registers a handler for pause events.
   * @param handler - Callback receiving debug state when execution pauses
   * @deprecated Use on('paused', handler) instead for event-driven approach
   */
  public onPaused(handler: PauseHandler): void {
    this.eventHandlers.onPaused(handler);
  }

  /**
   * Registers a handler for resume events.
   * @param handler - Callback invoked when execution resumes
   * @deprecated Use on('resumed', handler) instead for event-driven approach
   */
  public onResumed(handler: ResumeHandler): void {
    this.eventHandlers.onResumed(handler);
  }

  /**
   * Registers a handler for breakpoint resolution events.
   * @param handler - Callback receiving registration info when breakpoints are verified
   * @deprecated Use on('breakpointResolved', handler) instead for event-driven approach
   */
  public onBreakpointResolved(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.eventHandlers.onBreakpointResolved(handler);
  }

  /**
   * Registers a type-safe event handler for debug session events.
   * @param event - Event name (paused, resumed, console, terminated, breakpointResolved, error)
   * @param handler - Event callback
   * @returns Unsubscribe function
   */
  public on<K extends keyof DebugSessionEvents>(
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
  public off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void {
    this.eventEmitter.off(event, handler);
  }

  /**
   * Waits for the debugger to pause.
   * @param timeoutMs - Maximum wait time in milliseconds (default: 30000)
   * @returns Debug state when paused
   * @throws \{Error\} On timeout
   */
  public async waitForPause(timeoutMs = 30000): Promise<DebugState> {
    return createWaitForPausePromise(
      this.debugState,
      this.pausePromises,
      timeoutMs,
    );
  }

  /**
   * Returns a snapshot of the current debug state.
   * @returns Copy of current debug state
   */
  public getCurrentState(): DebugState {
    return { ...this.debugState };
  }

  /**
   * Resets adapter state after disconnection.
   * @internal
   */
  private resetState(): void {
    this.isConnected = false;
    resetAdapterState(this.pageManager, this.scripts, this.breakpointManager, {
      currentCallFrames: this.currentCallFrames,
      debugState: this.debugState,
    });
    // Update local references after mutation
    this.currentCallFrames = [];
    this.debugState = { status: 'terminated' };
  }
}
