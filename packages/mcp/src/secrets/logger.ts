/**
 * Logging abstraction for the secrets module.
 *
 * Provides a clean interface for logging across secret providers and managers,
 * following the SEAMS principle to allow different logging implementations
 * without changing the core business logic.
 */

/**
 * Log levels supported by the logging system.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Interface for structured logging with context.
 */
export interface ILogger {
  /**
   * Log a debug message.
   * @param message - The log message
   * @param context - Optional context object for structured logging
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * Log an info message.
   * @param message - The log message
   * @param context - Optional context object for structured logging
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * Log a warning message.
   * @param message - The log message
   * @param context - Optional context object for structured logging
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Log an error message.
   * @param message - The log message
   * @param error - Optional error object
   * @param context - Optional context object for structured logging
   */
  error(
    message: string,
    error?: Error | unknown,
    context?: Record<string, unknown>,
  ): void;
}

/**
 * Console-based logger implementation for development and simple deployments.
 *
 * Provides structured logging with optional context while maintaining
 * backward compatibility with console-based logging.
 */
export class ConsoleLogger implements ILogger {
  constructor(private prefix: string = '[secrets]') {}

  debug(message: string, context?: Record<string, unknown>): void {
    if (context && Object.keys(context).length > 0) {
      console.debug(`${this.prefix} ${message}`, context);
    } else {
      console.debug(`${this.prefix} ${message}`);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (context && Object.keys(context).length > 0) {
      console.info(`${this.prefix} ${message}`, context);
    } else {
      console.info(`${this.prefix} ${message}`);
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (context && Object.keys(context).length > 0) {
      console.warn(`${this.prefix} ${message}`, context);
    } else {
      console.warn(`${this.prefix} ${message}`);
    }
  }

  error(
    message: string,
    error?: Error | unknown,
    context?: Record<string, unknown>,
  ): void {
    const baseContext = context || {};
    const errorContext = error
      ? {
          error: error instanceof Error ? error.message : String(error),
        }
      : {};
    const allContext = {
      ...baseContext,
      ...errorContext,
    };

    if (Object.keys(allContext).length > 0) {
      console.error(`${this.prefix} ${message}`, allContext);
    } else {
      console.error(`${this.prefix} ${message}`);
    }

    // Log the stack trace separately if it's an Error object
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }
}

/**
 * No-op logger implementation for testing or when logging is disabled.
 */
export class NoOpLogger implements ILogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Default logger instance used throughout the secrets module.
 * Can be replaced with a custom implementation if needed.
 */
export let defaultLogger: ILogger = new ConsoleLogger();

/**
 * Sets the default logger for the secrets module.
 * Useful for dependency injection or testing scenarios.
 *
 * @param logger - The logger implementation to use
 */
export function setDefaultLogger(logger: ILogger): void {
  defaultLogger = logger;
}

/**
 * Creates a scoped logger with a specific prefix.
 *
 * @param scope - The scope/prefix for the logger
 * @returns A new logger instance with the specified scope
 */
export function createScopedLogger(scope: string): ILogger {
  return new ConsoleLogger(`[secrets:${scope}]`);
}
