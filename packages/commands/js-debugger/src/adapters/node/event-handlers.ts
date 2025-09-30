import type Emittery from 'emittery';
import type {
  ITypedCDPClient,
  BreakpointRegistration,
  ConsoleHandler,
  ResumeHandler,
  PauseHandler,
  ConsoleMessage,
  DebugSessionEvents,
  DebugState,
} from '../../types/index.js';
import type {
  CDPDebuggerPausedParams,
  CDPConsoleAPICalledParams,
  CDPBreakpoint,
} from '../../cdp/types.js';
import type { SourceMapHandler } from './source-map-handler.js';
import type { PauseHandlerManager } from './pause-handler.js';

// CDP Domain interfaces for type safety
interface CDPBreakpointResolvedEventParams {
  breakpointId: string;
  location: {
    scriptId: string;
    lineNumber: number;
    columnNumber?: number;
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
  sourceMapURL?: string;
}

/**
 * Manages Chrome DevTools Protocol (CDP) event handlers for Node.js debugging.
 *
 * This class centralizes all CDP event handling for the Node debug adapter, including:
 * - Debugger pause/resume events
 * - Breakpoint resolution
 * - Console output capture
 * - Script parsing and source map handling
 *
 * Handlers are registered during the connection setup phase and remain active for
 * the lifetime of the debug session. All handlers emit typed events through the
 * event emitter while maintaining backward compatibility with legacy callbacks.
 * @example
 * ```typescript
 * const manager = new EventHandlersManager(
 *   cdpClient,
 *   eventEmitter,
 *   sourceMapHandler,
 *   pauseHandlerManager,
 *   breakpoints,
 *   scriptIdToUrl,
 *   () => debugState,
 *   (state) => { debugState = state; },
 *   setCurrentCallFrame
 * );
 *
 * manager.setupCDPHandlers(
 *   consoleHandler,
 *   resumeHandler,
 *   breakpointResolvedHandler,
 *   pauseHandler
 * );
 * ```
 * @see file:../node-adapter.ts:131-142 - Construction in NodeDebugAdapter
 * @see file:../node-adapter.ts:183-188 - Usage during connection setup
 * @see file:./connection-manager.ts:24 - Phase 2 of connection lifecycle
 * @internal
 */
export class EventHandlersManager {
  public constructor(
    private cdpClient: ITypedCDPClient,
    private eventEmitter: Emittery<DebugSessionEvents>,
    private sourceMapHandler: SourceMapHandler,
    private pauseHandlerManager: PauseHandlerManager,
    private breakpoints: Map<string, CDPBreakpoint>,
    private scriptIdToUrl: Map<string, string>,
    private getDebugState: () => DebugState,
    private setDebugState: (state: DebugState) => void,
    private setCurrentCallFrame: (
      frameId?: string,
      frames?: CDPDebuggerPausedParams['callFrames'],
    ) => void,
  ) {}

  /**
   * Registers all CDP event handlers for the debug session.
   *
   * This method sets up listeners for all CDP events that the adapter needs to handle:
   * - Debugger.paused: Handles breakpoints and pause states
   * - Debugger.resumed: Tracks execution continuation
   * - Debugger.scriptParsed: Manages script loading and source maps
   * - Debugger.breakpointResolved: Tracks breakpoint verification
   * - Runtime.consoleAPICalled: Captures console output
   *
   * All handlers emit typed events through the event emitter and invoke optional
   * legacy callbacks for backward compatibility. Handlers remain active until the
   * debug session is terminated.
   * @param consoleHandler - Legacy callback for console messages
   * @param resumeHandler - Legacy callback for resume events
   * @param breakpointResolvedHandler - Legacy callback for breakpoint resolution
   * @param pauseHandler - Legacy callback for pause events
   * @see file:../node-adapter.ts:183-188 - Called during connection setup
   * @see file:../../types/events.ts:6-13 - DebugSessionEvents interface
   * @internal
   */
  public setupCDPHandlers(
    consoleHandler?: ConsoleHandler,
    resumeHandler?: ResumeHandler,
    breakpointResolvedHandler?: (reg: BreakpointRegistration) => void,
    pauseHandler?: PauseHandler,
  ): void {
    console.debug('[NodeDebugAdapter] Setting up CDP event handlers...');

    this.setupPausedHandler(pauseHandler);
    this.setupResumedHandler(resumeHandler);
    this.setupScriptParsedHandler();
    this.setupBreakpointResolvedHandler(breakpointResolvedHandler);
    this.setupConsoleHandler(consoleHandler);

    console.debug('[NodeDebugAdapter] All CDP event handlers registered');
  }

  /**
   * Registers the Debugger.paused event handler.
   *
   * Handles debugger pause events triggered by breakpoints, debugger statements,
   * exceptions, or step operations. The handler extracts call frame information,
   * updates debug state, and emits both typed events and legacy callbacks.
   *
   * Uses fire-and-forget error handling to prevent blocking CDP message processing.
   * @param pauseHandler - Optional legacy callback for pause events
   * @internal
   */
  private setupPausedHandler(pauseHandler?: PauseHandler): void {
    // Handle debugger paused events
    this.cdpClient.on('Debugger.paused', (params: unknown) => {
      // Fire and forget - we don't want to block CDP processing
      this.handlePaused(params as CDPDebuggerPausedParams, pauseHandler).catch(
        (error) => {
          console.error('[NodeDebugAdapter] Error in handlePaused:', error);
          this.eventEmitter.emit(
            'error',
            error instanceof Error ? error : new Error(String(error)),
          );
        },
      );
    });
    console.debug('[NodeDebugAdapter] Debugger.paused handler registered');
  }

  /**
   * Registers the Debugger.resumed event handler.
   *
   * Handles debugger resume events that occur after continue, step, or other
   * execution control operations. Updates debug state to 'running' and clears
   * call frame context since the debugger is no longer paused.
   * @param resumeHandler - Optional legacy callback for resume events
   * @internal
   */
  private setupResumedHandler(resumeHandler?: ResumeHandler): void {
    // Handle debugger resumed events
    this.cdpClient.on('Debugger.resumed', () => {
      this.setDebugState({ status: 'running' });
      this.setCurrentCallFrame(undefined, undefined);

      // Emit typed event (fire and forget)
      this.eventEmitter.emit('resumed', undefined).catch((error) => {
        console.error(
          '[NodeDebugAdapter] Error emitting resumed event:',
          error,
        );
      });

      // Keep legacy callback for backward compatibility
      resumeHandler?.();
    });
  }

  /**
   * Registers the Debugger.scriptParsed event handler.
   *
   * Handles script parsing events from Node.js, maintaining the script ID to URL
   * mapping and delegating source map processing to the SourceMapHandler. This
   * mapping is essential for resolving file locations in pause events and stack traces.
   * Empty URLs are preserved in the mapping to maintain consistency for dynamically evaluated code.
   * @internal
   */
  private setupScriptParsedHandler(): void {
    // Handle script parsed events
    this.cdpClient.on('Debugger.scriptParsed', (params: unknown) => {
      const parsedParams = params as CDPScriptParsedEventParams;
      // Always set the mapping, even for empty URLs
      this.scriptIdToUrl.set(parsedParams.scriptId, parsedParams.url || '');

      // Handle source maps
      this.handleScriptParsed(parsedParams).catch((error) => {
        console.warn('[NodeDebugAdapter] Error handling script parsed:', error);
      });
    });
  }

  /**
   * Registers the Debugger.breakpointResolved event handler.
   *
   * Handles breakpoint resolution events that occur when the debugger verifies
   * a breakpoint location in loaded code. The handler constructs a BreakpointRegistration
   * object with the resolved location, converting CDP's 0-based line numbers to 1-based.
   * Only processes events for known breakpoints; unknown IDs are silently ignored.
   * @param breakpointResolvedHandler - Optional legacy callback for breakpoint resolution
   * @internal
   */
  private setupBreakpointResolvedHandler(
    breakpointResolvedHandler?: (reg: BreakpointRegistration) => void,
  ): void {
    // Handle breakpoint resolved events
    this.cdpClient.on('Debugger.breakpointResolved', (params: unknown) => {
      const resolvedParams = params as CDPBreakpointResolvedEventParams;
      const bp = this.breakpoints.get(resolvedParams.breakpointId);
      if (bp) {
        const url =
          this.scriptIdToUrl.get(resolvedParams.location.scriptId) || 'unknown';
        const registration: BreakpointRegistration = {
          id: resolvedParams.breakpointId,
          verified: true,
          resolvedLocations: [
            {
              file: url,
              line: resolvedParams.location.lineNumber + 1,
              column: resolvedParams.location.columnNumber,
            },
          ],
        };

        // Emit typed event (fire and forget)
        this.eventEmitter
          .emit('breakpointResolved', registration)
          .catch((error) => {
            console.error(
              '[NodeDebugAdapter] Error emitting breakpointResolved event:',
              error,
            );
          });

        // Keep legacy callback for backward compatibility
        breakpointResolvedHandler?.(registration);
      }
    });
  }

  /**
   * Registers the Runtime.consoleAPICalled event handler.
   *
   * Captures all console output (log, warn, error, debug, etc.) from the debugged
   * Node.js process. Transforms CDP console parameters into structured ConsoleMessage
   * objects with normalized log levels, formatted arguments, and stack traces.
   *
   * Console arguments are stringified using description or value properties, and
   * line numbers in stack traces are converted from 0-based to 1-based.
   * @param consoleHandler - Optional legacy callback for console messages
   * @internal
   */
  private setupConsoleHandler(consoleHandler?: ConsoleHandler): void {
    // Handle console output
    this.cdpClient.on('Runtime.consoleAPICalled', (params: unknown) => {
      const consoleParams = params as CDPConsoleAPICalledParams;
      const message: ConsoleMessage = {
        level: this.mapConsoleLevel(consoleParams.type),
        timestamp: new Date(consoleParams.timestamp).toISOString(),
        message: consoleParams.args
          .map((arg) => arg.description || arg.value)
          .join(' '),
        args: consoleParams.args.map((arg) => arg.value),
        stackTrace: consoleParams.stackTrace?.callFrames.map((frame, idx) => ({
          id: idx,
          functionName: frame.functionName || '<anonymous>',
          file: frame.url,
          line: frame.lineNumber + 1,
          column: frame.columnNumber,
        })),
      };

      // Emit typed event (fire and forget)
      this.eventEmitter.emit('console', message).catch((error) => {
        console.error(
          '[NodeDebugAdapter] Error emitting console event:',
          error,
        );
      });

      // Keep legacy callback for backward compatibility
      consoleHandler?.(message);
    });
  }

  /**
   * Handles the CDP Debugger.paused event asynchronously.
   *
   * Orchestrates pause event processing by:
   * 1. Extracting call frame information for evaluation context
   * 2. Storing the current call frame for variable inspection
   * 3. Delegating state construction to PauseHandlerManager
   * 4. Updating the adapter's debug state
   * 5. Emitting the typed 'paused' event
   *
   * This method is called asynchronously from setupPausedHandler and any errors
   * are caught and emitted as error events to prevent blocking CDP processing.
   * @param params - CDP Debugger.paused event parameters
   * @param pauseHandler - Optional legacy callback for pause events
   * @see file:./pause-handler.ts:139 - State construction logic
   * @internal
   */
  private async handlePaused(
    params: CDPDebuggerPausedParams,
    pauseHandler?: PauseHandler,
  ): Promise<void> {
    // Extract call frame info
    const { currentCallFrameId, currentCallFrames } =
      this.pauseHandlerManager.extractCallFrameInfo(params);

    // Store current call frame for evaluation context
    this.setCurrentCallFrame(currentCallFrameId, currentCallFrames);

    // Handle pause logic and get new debug state
    const debugState = this.pauseHandlerManager.handlePaused(
      params,
      pauseHandler,
    );

    // Update debug state
    this.setDebugState(debugState);

    // Emit typed event
    await this.eventEmitter.emit('paused', debugState);
  }

  /**
   * Maps CDP console API call types to normalized console message levels.
   *
   * CDP uses different type names than our ConsoleMessage level type:
   * - 'warning' → 'warn'
   * - 'assert' → 'error'
   * - Others map directly: 'error', 'info', 'debug', 'trace'
   * - Defaults to 'log' for unknown types
   * @param type - CDP console API call type
   * @returns Normalized console message level
   * @internal
   */
  private mapConsoleLevel(type: string): ConsoleMessage['level'] {
    switch (type) {
      case 'warning':
        return 'warn';
      case 'error':
      case 'assert':
        return 'error';
      case 'info':
        return 'info';
      case 'debug':
        return 'debug';
      case 'trace':
        return 'trace';
      default:
        return 'log';
    }
  }

  /**
   * Delegates script parsing and source map handling to SourceMapHandler.
   *
   * Extracts relevant script information (scriptId, url, sourceMapURL) from
   * CDP script parsed events and forwards to the source map handler for
   * processing. This enables source map resolution for TypeScript, bundled
   * code, and other transpiled sources.
   * @param params - CDP Debugger.scriptParsed event parameters
   * @internal
   */
  private async handleScriptParsed(
    params: CDPScriptParsedEventParams,
  ): Promise<void> {
    await this.sourceMapHandler.handleScriptParsed({
      scriptId: params.scriptId,
      url: params.url,
      sourceMapURL: params.sourceMapURL,
    });
  }
}
