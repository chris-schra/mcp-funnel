import Emittery from 'emittery';
import {
  ConsoleMessage,
  ConsoleHandler,
  DebugSessionEvents,
  StackFrame,
} from '../../types/index.js';
import {
  CDPConsoleAPICalledParams,
  CDPExceptionThrownParams,
  CDPStackTrace,
} from '../../cdp/index.js';

/**
 * Handles console messages and exceptions from the browser debugging session.
 *
 * This handler bridges Chrome DevTools Protocol (CDP) console events into the
 * debugger's event system, converting CDP-specific formats into standardized
 * {@link ConsoleMessage} objects. Supports both modern event-driven subscriptions
 * via Emittery and legacy callback-based handlers.
 *
 * Key responsibilities:
 * - Transform CDP console.* API calls into ConsoleMessage format
 * - Transform CDP runtime exceptions into ConsoleMessage format
 * - Emit messages to typed event system (Emittery)
 * - Notify legacy callback handlers for backward compatibility
 * @example
 * ```typescript
 * const eventEmitter = new Emittery<DebugSessionEvents>();
 * const consoleHandler = new BrowserConsoleHandler(eventEmitter);
 *
 * // Modern event-driven approach
 * eventEmitter.on('console', (message) => {
 *   console.log(`[${message.level}] ${message.message}`);
 * });
 *
 * // Legacy callback approach
 * consoleHandler.onConsoleOutput((message) => {
 *   console.log(`[${message.level}] ${message.message}`);
 * });
 * ```
 * @see file:../../types/console.ts - ConsoleMessage type definition
 * @see file:../../types/events.ts - DebugSessionEvents type definition
 * @see file:../../cdp/types.ts - CDP type definitions
 * @internal
 */
export class BrowserConsoleHandler {
  private consoleHandlers: ConsoleHandler[] = [];
  private eventEmitter: Emittery<DebugSessionEvents>;

  /**
   * Creates a new BrowserConsoleHandler instance.
   * @param eventEmitter - Typed event emitter for debug session events
   */
  public constructor(eventEmitter: Emittery<DebugSessionEvents>) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Registers a legacy callback-based console output handler.
   *
   * This method provides backward compatibility for callback-based console
   * handling. For new code, prefer subscribing to the 'console' event on the
   * event emitter passed to the constructor.
   * @param handler - Callback function to invoke for each console message
   * @example
   * ```typescript
   * consoleHandler.onConsoleOutput((message) => {
   *   if (message.level === 'error') {
   *     logError(message.message);
   *   }
   * });
   * ```
   */
  public onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandlers.push(handler);
  }

  /**
   * Processes a console API call event from Chrome DevTools Protocol.
   *
   * Transforms CDP's Runtime.consoleAPICalled event into a standardized
   * {@link ConsoleMessage} format. Handles all console methods (log, warn, error,
   * debug, info, trace) and concatenates multiple arguments into a single message.
   * @param params - CDP console API called parameters containing console type,
   *                 arguments, timestamp, and optional stack trace
   * @see {@link CDPConsoleAPICalledParams}
   * @see {@link BrowserEventHandlers|Usage in event handlers}
   */
  public handleConsoleMessage(params: CDPConsoleAPICalledParams): void {
    const message: ConsoleMessage = {
      level: this.mapConsoleLevel(params.type),
      timestamp: new Date(params.timestamp).toISOString(),
      message: params.args
        .map((arg) => arg.description || String(arg.value || ''))
        .join(' '),
      args: params.args.map((arg) => arg.value),
      stackTrace: params.stackTrace
        ? this.parseStackTrace(params.stackTrace)
        : undefined,
    };

    this.emitConsoleMessage(message);
  }

  /**
   * Processes a runtime exception event from Chrome DevTools Protocol.
   *
   * Transforms CDP's Runtime.exceptionThrown event into a standardized
   * {@link ConsoleMessage} with error level. Extracts exception description,
   * value, and stack trace from the CDP exception details.
   * @param params - CDP exception thrown parameters containing exception details,
   *                 description text, and optional stack trace
   * @see file:../../cdp/types.ts:120-129 - CDPExceptionThrownParams definition
   * @see file:./event-handlers.ts:130-132 - Usage in event handlers
   */
  public handleException(params: CDPExceptionThrownParams): void {
    const message: ConsoleMessage = {
      level: 'error',
      timestamp: new Date().toISOString(),
      message:
        params.exceptionDetails.exception?.description ||
        params.exceptionDetails.text,
      args: [params.exceptionDetails.exception?.value],
      stackTrace: params.exceptionDetails.stackTrace
        ? this.parseStackTrace(params.exceptionDetails.stackTrace)
        : undefined,
    };

    this.emitConsoleMessage(message);
  }

  /**
   * Dispatches a console message to both event subscribers and legacy handlers.
   *
   * This method ensures dual delivery of console messages:
   * 1. Emits to the typed event system (Emittery) for modern subscribers
   * 2. Invokes all registered legacy callback handlers for backward compatibility
   *
   * Legacy handlers are wrapped in try-catch to prevent one handler's failure
   * from affecting others. Errors in handlers are logged to Node.js console.
   * @param message - Standardized console message to dispatch
   */
  private emitConsoleMessage(message: ConsoleMessage): void {
    // Emit typed event
    this.eventEmitter.emit('console', message);

    // Notify console handlers (legacy callback support)
    this.consoleHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.warn('Error in console handler:', error);
      }
    });
  }

  /**
   * Converts CDP console type strings to standardized console levels.
   *
   * Maps Chrome DevTools Protocol's console type strings (which include
   * 'warning', 'log', 'info', etc.) to the debugger's standardized
   * {@link ConsoleMessage} level type. Unknown types default to 'log'.
   * @param type - CDP console type string from Runtime.consoleAPICalled event
   * @returns Standardized console level for ConsoleMessage
   * @see file:../../cdp/types.ts:91-109 - CDP console types
   * @see file:../../types/console.ts:4 - ConsoleMessage level type
   */
  private mapConsoleLevel(
    type: string,
  ): 'log' | 'debug' | 'info' | 'warn' | 'error' | 'trace' {
    switch (type) {
      case 'warning':
        return 'warn';
      case 'trace':
        return 'trace';
      case 'error':
        return 'error';
      case 'debug':
        return 'debug';
      case 'info':
        return 'info';
      default:
        return 'log';
    }
  }

  /**
   * Transforms CDP stack trace format into standardized stack frames.
   *
   * Converts Chrome DevTools Protocol's {@link CDPStackTrace} structure
   * into an array of {@link StackFrame} objects. Adjusts line numbers from
   * 0-indexed (CDP) to 1-indexed (user-facing), converts URLs to file paths,
   * and assigns sequential frame IDs.
   * @param stackTrace - CDP stack trace containing call frames from Runtime events
   * @returns Array of standardized stack frames, or empty array if no call frames present
   * @see file:../../cdp/types.ts:131-138 - CDPStackTrace definition
   * @see file:../../types/evaluation.ts:3-11 - StackFrame definition
   */
  private parseStackTrace(stackTrace: CDPStackTrace): StackFrame[] {
    if (!stackTrace?.callFrames) {
      return [];
    }

    return stackTrace.callFrames.map((frame, index: number) => ({
      id: index,
      functionName: frame.functionName || '(anonymous)',
      file: this.urlToFilePath(frame.url),
      line: (frame.lineNumber || 0) + 1,
      column: frame.columnNumber,
    }));
  }

  /**
   * Converts file:// URLs to local file system paths.
   *
   * Strips the 'file://' protocol prefix to convert CDP's URL format into
   * user-facing file paths. Non-file URLs (http://, https://) are returned
   * unchanged as they represent remote resources.
   * @param url - URL string from CDP (may be file://, http://, https://, or data: URI)
   * @returns Local file path if URL starts with 'file://', otherwise returns URL unchanged
   * @example
   * ```typescript
   * urlToFilePath('file:///home/user/script.js')  // '/home/user/script.js'
   * urlToFilePath('http://localhost:3000/app.js') // 'http://localhost:3000/app.js'
   * ```
   */
  private urlToFilePath(url: string): string {
    if (url.startsWith('file://')) {
      return url.slice(7);
    }
    return url;
  }
}
