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
 * Manages CDP event handlers for the Node debug adapter
 */
export class EventHandlersManager {
  constructor(
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
   * Setup all CDP event handlers
   */
  setupCDPHandlers(
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
