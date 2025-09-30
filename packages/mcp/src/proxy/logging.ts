import { writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ILogger, ErrorContext } from './types.js';
import { getServerStreamLogPath, logError, logEvent } from '@mcp-funnel/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, '../../.logs');

// Ensure log directory exists
try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch (_error) {
  // Log dir might already exist
}

/**
 * Default logger implementation that combines legacy file logging
 * with structured logging via the logger module
 * @internal
 */
export class DefaultLogger implements ILogger {
  public error(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void {
    console.error(message, error);
    if (error && context) {
      const serverName = context.serverName as string | undefined;
      const contextStr = (context.context as string) || 'general';
      this.legacyErrorLog(error, contextStr, serverName);
      logError(contextStr, error, context);
    }
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    console.error(message);
    if (context) {
      logEvent('warn', message, context);
    }
  }

  public info(message: string, context?: Record<string, unknown>): void {
    console.error(message);
    if (context) {
      logEvent('info', message, context);
    }
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    if (context) {
      logEvent('debug', message, context);
    }
  }

  /**
   * Legacy error logging for backward compatibility
   * Creates detailed error log files for debugging
   * @param error - Error object to log
   * @param context - Error context (defaults to 'general')
   * @param serverName - Optional server name for log file naming
   * @internal
   */
  private legacyErrorLog(
    error: unknown,
    context: string = 'general',
    serverName?: string,
  ): void {
    const timestamp = new Date().toISOString();
    const prefix = serverName ? `${serverName}-` : '';
    const logFile = resolve(
      LOG_DIR,
      `error-${timestamp.replace(/:/g, '-')}-${prefix}${context}.log`,
    );

    const err = error as {
      message?: string;
      stack?: string;
      code?: string;
      syscall?: string;
      path?: string;
    };

    const errorDetails: ErrorContext = {
      timestamp,
      context,
      serverName,
      message: err?.message || String(error),
      stack: err?.stack,
      code: err?.code,
      syscall: err?.syscall,
      path: err?.path,
      processInfo: {
        pid: process.pid,
        argv: process.argv,
        cwd: process.cwd(),
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
        },
      },
    };

    try {
      writeFileSync(logFile, JSON.stringify(errorDetails, null, 2));
      console.error(`[proxy] Error logged to: ${logFile}`);
    } catch (writeError) {
      console.error('[proxy] Failed to write error log:', writeError);
    }
  }
}

/**
 * Factory function to create loggers
 * SEAM: Can be extended to return different logger implementations
 * based on configuration (e.g., remote logging, different formats)
 * @param type - Logger type identifier (currently only 'default' is implemented)
 * @returns Logger instance
 * @internal
 */
export function createLogger(type: 'default' | string = 'default'): ILogger {
  switch (type) {
    case 'default':
      return new DefaultLogger();
    default:
      // SEAM: Future logger implementations can be added here
      return new DefaultLogger();
  }
}

/**
 * Singleton logger instance used throughout the proxy
 * @internal
 */
export const logger = createLogger();

/**
 * Helper to log server stream output
 * @param serverName - Name of the server
 * @param streamType - Type of stream (stdout or stderr)
 * @param line - Log line to write
 * @internal
 */
export function logServerStream(
  serverName: string,
  streamType: 'stdout' | 'stderr',
  line: string,
): void {
  if (!line.trim()) return;

  try {
    appendFileSync(
      getServerStreamLogPath(serverName, streamType),
      `[${new Date().toISOString()}] ${line}\n`,
    );
  } catch {
    // Failed to append to stream log file
  }
}

/**
 * Helper to create prefixed log messages
 * @param serverName - Name of the server
 * @param message - Log message to prefix
 * @returns Prefixed log message
 * @internal
 */
export function prefixedLog(serverName: string, message: string): string {
  return `[${serverName}] ${message}`;
}
