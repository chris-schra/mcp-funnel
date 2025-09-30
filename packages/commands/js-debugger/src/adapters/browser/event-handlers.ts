import Emittery from 'emittery';
import {
  DebugState,
  DebugSessionEvents,
  PauseHandler,
  ResumeHandler,
  BreakpointRegistration,
} from '../../types/index.js';
import {
  CDPClient,
  CDPBreakpoint,
  CDPCallFrame,
  CDPDebuggerPausedParams,
  CDPScriptParsedParams,
  CDPConsoleAPICalledParams,
  CDPExceptionThrownParams,
} from '../../cdp/index.js';
import { BrowserConsoleHandler } from './console-handler.js';
import {
  handleDebuggerPaused,
  handleDebuggerResumed,
  type PauseHandlerContext,
} from './handlers/pause-handler.js';
import {
  handleScriptParsed,
  type ScriptHandlerContext,
  type ScriptInfo,
} from './handlers/script-handler.js';
import {
  handleBreakpointResolved,
  type BreakpointHandlerContext,
} from './handlers/breakpoint-handler.js';

/**
 * Manages Chrome DevTools Protocol event handlers for browser debugging sessions.
 *
 * Coordinates event handling between CDP events and the debug session, managing
 * pause/resume states, breakpoints, console output, and script lifecycle events.
 * Acts as the central event dispatcher that maintains debug state consistency.
 * @internal
 * @see file:./handlers/pause-handler.ts - Pause/resume event handling logic
 * @see file:./handlers/breakpoint-handler.ts - Breakpoint resolution logic
 * @see file:./handlers/script-handler.ts - Script parsing and source map handling
 */
export class BrowserEventHandlers {
  private cdpClient: CDPClient;
  private eventEmitter: Emittery<DebugSessionEvents>;
  private consoleHandler: BrowserConsoleHandler;

  // State references (injected from main adapter)
  private scripts: Map<string, ScriptInfo>;
  private breakpoints: Map<string, CDPBreakpoint>;
  private currentCallFrames: CDPCallFrame[];
  private debugState: DebugState;
  private projectRoot?: string;
  private updateMainAdapterState?: (state: DebugState) => void;

  // Legacy callback handlers
  private pauseHandlers: PauseHandler[] = [];
  private resumeHandlers: ResumeHandler[] = [];
  private breakpointResolvedHandlers: Array<
    (registration: BreakpointRegistration) => void
  > = [];

  // Pause state management
  private pausePromises: Set<{
    resolve: (state: DebugState) => void;
    reject: (error: Error) => void;
    timeout?: NodeJS.Timeout;
  }>;

  /**
   * Creates a new browser event handler instance.
   * @param cdpClient - CDP client for communicating with browser debugger
   * @param eventEmitter - Event emitter for publishing debug session events
   * @param consoleHandler - Handler for browser console messages and exceptions
   * @param scripts - Map of scriptId to script metadata (shared reference, updated in place)
   * @param breakpoints - Map of breakpointId to CDP breakpoint data (shared reference)
   * @param debugState - Current debug state (will be updated by event handlers)
   * @param pausePromises - Set of pending pause promises to resolve when debugger pauses
   * @param currentCallFrames - Array of current call frames (shared reference, updated in place)
   * @param projectRoot - Optional project root directory for resolving relative paths
   * @param updateMainAdapterState - Optional callback to notify main adapter of state changes
   */
  public constructor(
    cdpClient: CDPClient,
    eventEmitter: Emittery<DebugSessionEvents>,
    consoleHandler: BrowserConsoleHandler,
    // State references
    scripts: Map<string, ScriptInfo>,
    breakpoints: Map<string, CDPBreakpoint>,
    debugState: DebugState,
    pausePromises: Set<{
      resolve: (state: DebugState) => void;
      reject: (error: Error) => void;
      timeout?: NodeJS.Timeout;
    }>,
    currentCallFrames: CDPCallFrame[],
    projectRoot?: string,
    updateMainAdapterState?: (state: DebugState) => void,
  ) {
    this.cdpClient = cdpClient;
    this.eventEmitter = eventEmitter;
    this.consoleHandler = consoleHandler;
    this.scripts = scripts;
    this.breakpoints = breakpoints;
    this.debugState = debugState;
    this.pausePromises = pausePromises;
    this.currentCallFrames = currentCallFrames;
    this.projectRoot = projectRoot;
    this.updateMainAdapterState = updateMainAdapterState;
  }

  /**
   * Registers all CDP event handlers with the CDP client.
   *
   * Sets up listeners for debugger events (paused, resumed, scriptParsed, breakpointResolved)
   * and console events (consoleAPICalled, exceptionThrown). Must be called once during
   * initialization before starting the debug session.
   */
  public setupEventHandlers(): void {
    // Debugger events
    this.cdpClient.on('Debugger.paused', (params: unknown) => {
      this.onDebuggerPaused(params as CDPDebuggerPausedParams);
    });

    this.cdpClient.on('Debugger.resumed', () => {
      this.onDebuggerResumed();
    });

    this.cdpClient.on('Debugger.scriptParsed', (params: unknown) => {
      this.onScriptParsed(params as CDPScriptParsedParams);
    });

    this.cdpClient.on('Debugger.breakpointResolved', (params: unknown) => {
      this.handleBreakpointResolvedEvent(
        params as {
          breakpointId: string;
          location: {
            scriptId: string;
            lineNumber: number;
            columnNumber?: number;
          };
        },
      );
    });

    // Console events - delegate to console handler
    this.cdpClient.on('Runtime.consoleAPICalled', (params: unknown) => {
      this.consoleHandler.handleConsoleMessage(
        params as CDPConsoleAPICalledParams,
      );
    });

    this.cdpClient.on('Runtime.exceptionThrown', (params: unknown) => {
      this.consoleHandler.handleException(params as CDPExceptionThrownParams);
    });
  }

  /**
   * Registers a callback to be invoked when the debugger pauses.
   * @param handler - Callback function that receives the new debug state when paused
   */
  public onPaused(handler: PauseHandler): void {
    this.pauseHandlers.push(handler);
  }

  /**
   * Registers a callback to be invoked when the debugger resumes execution.
   * @param handler - Callback function invoked when execution resumes
   */
  public onResumed(handler: ResumeHandler): void {
    this.resumeHandlers.push(handler);
  }

  /**
   * Registers a callback to be invoked when a breakpoint is resolved by the browser.
   *
   * Breakpoints are resolved asynchronously after being set, once the browser
   * confirms the actual location where the breakpoint was placed.
   * @param handler - Callback function that receives breakpoint registration details
   */
  public onBreakpointResolved(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.breakpointResolvedHandlers.push(handler);
  }

  /**
   * Updates internal state references when the main adapter's state changes.
   * @param debugState - Updated debug state from the main adapter
   * @param projectRoot - Updated project root directory, if changed
   */
  public updateState(debugState: DebugState, projectRoot?: string): void {
    this.debugState = debugState;
    this.projectRoot = projectRoot;
  }

  /**
   * Handles CDP Debugger.paused event and updates debug state accordingly.
   *
   * Processes pause reasons, call frames, hit breakpoints, and resolves any pending
   * pause promises. Delegates the actual state update logic to pause-handler.
   * @param params - CDP debugger paused event parameters containing call frames and pause reason
   */
  private onDebuggerPaused(params: CDPDebuggerPausedParams): void {
    const context = this.createPauseHandlerContext();
    this.debugState = handleDebuggerPaused(
      params,
      context,
      this.eventEmitter,
      this.pauseHandlers,
      this.breakpointResolvedHandlers,
    );
  }

  /**
   * Handles CDP Debugger.resumed event and updates debug state to running.
   *
   * Clears call frames and notifies all resume handlers. Delegates the actual
   * state update logic to pause-handler.
   */
  private onDebuggerResumed(): void {
    const context = this.createPauseHandlerContext();
    this.debugState = handleDebuggerResumed(
      context,
      this.eventEmitter,
      this.resumeHandlers,
    );
  }

  /**
   * Handles CDP Debugger.scriptParsed event to track loaded scripts.
   *
   * Registers the script and initiates source map loading if available.
   * Delegates processing to script-handler.
   * @param params - CDP script parsed event parameters containing script metadata
   */
  private onScriptParsed(params: CDPScriptParsedParams): void {
    const context: ScriptHandlerContext = {
      scripts: this.scripts,
    };
    handleScriptParsed(params, context);
  }

  /**
   * Handles CDP Debugger.breakpointResolved event to track verified breakpoint locations.
   *
   * Updates the breakpoint registry with the resolved location and notifies handlers.
   * Delegates processing to breakpoint-handler. The params object contains the breakpointId
   * and location details (scriptId, lineNumber, and optional columnNumber).
   * @param params - Breakpoint resolution event parameters with breakpointId and location
   */
  private handleBreakpointResolvedEvent(params: {
    breakpointId: string;
    location: {
      scriptId: string;
      lineNumber: number;
      columnNumber?: number;
    };
  }): void {
    const context = this.createBreakpointHandlerContext();
    handleBreakpointResolved(
      params,
      context,
      this.eventEmitter,
      this.breakpointResolvedHandlers,
    );
  }

  /**
   * Creates a context object containing all state needed for pause handling operations.
   *
   * Bundles together all the shared state references and callbacks that the pause handler
   * needs to update debug state and notify the main adapter of changes.
   * @returns Context object with state references and update callbacks
   */
  private createPauseHandlerContext(): PauseHandlerContext {
    return {
      scripts: this.scripts,
      breakpoints: this.breakpoints,
      currentCallFrames: this.currentCallFrames,
      debugState: this.debugState,
      projectRoot: this.projectRoot,
      pausePromises: this.pausePromises,
      onStateUpdated: this.updateMainAdapterState,
      onProjectRootUpdated: (newProjectRoot: string) => {
        this.projectRoot = newProjectRoot;
      },
    };
  }

  /**
   * Creates a context object containing all state needed for breakpoint handling operations.
   *
   * Bundles together the script registry, breakpoint registry, and project root information
   * that the breakpoint handler needs to resolve breakpoint locations.
   * @returns Context object with state references for breakpoint resolution
   */
  private createBreakpointHandlerContext(): BreakpointHandlerContext {
    return {
      scripts: this.scripts,
      breakpoints: this.breakpoints,
      projectRoot: this.projectRoot,
      onProjectRootUpdated: (newProjectRoot: string) => {
        this.projectRoot = newProjectRoot;
      },
    };
  }
}
