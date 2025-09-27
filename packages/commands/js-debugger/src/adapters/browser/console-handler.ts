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
 * Handles console messages and exceptions from the browser
 */
export class BrowserConsoleHandler {
  private consoleHandlers: ConsoleHandler[] = [];
  private eventEmitter: Emittery<DebugSessionEvents>;

  constructor(eventEmitter: Emittery<DebugSessionEvents>) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Register console output handler
   */
  onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandlers.push(handler);
  }

  /**
   * Handle console message from CDP
   */
  handleConsoleMessage(params: CDPConsoleAPICalledParams): void {
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
   * Handle runtime exception from CDP
   */
  handleException(params: CDPExceptionThrownParams): void {
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
   * Emit console message to both typed event system and legacy handlers
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
   * Map CDP console types to our console levels
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
   * Parse CDP stack trace to our format
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
   * Convert URL back to file path for display
   */
  private urlToFilePath(url: string): string {
    if (url.startsWith('file://')) {
      return url.slice(7);
    }
    return url;
  }
}
