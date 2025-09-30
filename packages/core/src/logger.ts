import { appendFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, '../.logs');

// Ensure log directory exists
try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // ignore
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

function currentLevel(): LogLevel {
  const env = (process.env.MCP_FUNNEL_LOG_LEVEL || '').toLowerCase();
  if (env && ['error', 'warn', 'info', 'debug', 'trace'].includes(env)) {
    return env as LogLevel;
  }
  return 'info';
}

function enabled(min: LogLevel): boolean {
  const lvl = currentLevel();
  return LEVELS[lvl] >= LEVELS[min];
}

function runId(): string {
  if (!process.env.MCP_FUNNEL_RUN_ID) {
    // Stable per-process identifier so multiple files can correlate
    process.env.MCP_FUNNEL_RUN_ID = `${Date.now()}-${process.pid}`;
  }
  return process.env.MCP_FUNNEL_RUN_ID;
}

function logFile(): string {
  return resolve(LOG_DIR, `run-${runId()}.jsonl`);
}

export function logEvent(level: LogLevel, event: string, data?: unknown): void {
  // Always write to file when logging is enabled or level is error
  const loggingEnabled =
    process.env.MCP_FUNNEL_LOG === '1' ||
    process.env.MCP_FUNNEL_LOG === 'true' ||
    level === 'error';
  if (!loggingEnabled) return;

  // Respect level threshold for non-error levels
  if (level !== 'error' && !enabled(level)) return;

  const entry = {
    ts: new Date().toISOString(),
    pid: process.pid,
    level,
    event,
    data,
  };
  try {
    appendFileSync(logFile(), JSON.stringify(entry) + '\n', {
      encoding: 'utf8',
    });
  } catch {
    // Avoid throwing from logger
  }
}

export function logError(
  context: string,
  rawError: unknown,
  extra?: unknown,
): void {
  const err = rawError as { message?: string; stack?: string; code?: unknown };
  logEvent('error', `error:${context}`, {
    message: err?.message ?? String(rawError),
    stack: err?.stack,
    code: (err as { code?: unknown })?.code,
    extra,
    argv: process.argv,
    cwd: process.cwd(),
  });
}

export function getServerStreamLogPath(
  serverName: string,
  stream: 'stderr' | 'stdout',
): string {
  return resolve(LOG_DIR, `run-${runId()}-${serverName}.${stream}.log`);
}

/**
 * Logging abstraction for the secrets module.
 *
 * Provides a clean interface for logging across secret providers and managers,
 * following the SEAMS principle to allow different logging implementations
 * without changing the core business logic.
 */

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
  public constructor(private prefix: string = '[secrets]') {}

  public debug(message: string, context?: Record<string, unknown>): void {
    if (context && Object.keys(context).length > 0) {
      console.debug(`${this.prefix} ${message}`, context);
    } else {
      console.debug(`${this.prefix} ${message}`);
    }
  }

  public info(message: string, context?: Record<string, unknown>): void {
    if (context && Object.keys(context).length > 0) {
      console.info(`${this.prefix} ${message}`, context);
    } else {
      console.info(`${this.prefix} ${message}`);
    }
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    if (context && Object.keys(context).length > 0) {
      console.warn(`${this.prefix} ${message}`, context);
    } else {
      console.warn(`${this.prefix} ${message}`);
    }
  }

  public error(
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
  public debug(): void {}
  public info(): void {}
  public warn(): void {}
  public error(): void {}
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
