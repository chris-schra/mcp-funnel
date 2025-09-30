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
 * Manages CDP event handlers for browser debugging
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

  constructor(
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
   * Setup all CDP event handlers
   */
  setupEventHandlers(): void {
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
   * Register pause handler
   */
  onPaused(handler: PauseHandler): void {
    this.pauseHandlers.push(handler);
  }

  /**
   * Register resume handler
   */
  onResumed(handler: ResumeHandler): void {
    this.resumeHandlers.push(handler);
  }

  /**
   * Register breakpoint resolved handler
   */
  onBreakpointResolved(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.breakpointResolvedHandlers.push(handler);
  }

  /**
   * Update state references (called when state changes in main adapter)
   */
  updateState(debugState: DebugState, projectRoot?: string): void {
    this.debugState = debugState;
    this.projectRoot = projectRoot;
  }

  /**
   * Handle debugger paused event - delegates to pause-handler
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
   * Handle debugger resumed event - delegates to pause-handler
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
   * Handle script parsed event - delegates to script-handler
   */
  private onScriptParsed(params: CDPScriptParsedParams): void {
    const context: ScriptHandlerContext = {
      scripts: this.scripts,
    };
    handleScriptParsed(params, context);
  }

  /**
   * Handle breakpoint resolved event - delegates to breakpoint-handler
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
   * Creates context for pause handler operations
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
   * Creates context for breakpoint handler operations
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
