import type { ConsoleEntry, ExceptionEntry, StdioEntry } from '../../src/types/index.js';

/**
 * Factory for creating test stdio entries with default values.
 * @param stream - The stream type (stdout or stderr)
 * @param text - The text content of the entry
 * @returns A stdio entry object
 */
export const createStdioEntry = (stream: 'stdout' | 'stderr', text: string): StdioEntry => ({
  stream,
  text,
  timestamp: Date.now(),
  offset: 0,
});

/**
 * Factory for creating test console entries with default values.
 * @param level - The console log level
 * @param text - The text content of the entry
 * @returns A console entry object
 */
export const createConsoleEntry = (
  level: 'log' | 'error' | 'warn' | 'info' | 'debug',
  text: string,
): ConsoleEntry => ({
  level,
  origin: 'console',
  text,
  arguments: [
    {
      remote: { type: 'string', value: text },
      text,
    },
  ],
  timestamp: Date.now(),
});

/**
 * Factory for creating test exception entries with default values.
 * @param text - The exception text content
 * @returns An exception entry object
 */
export const createExceptionEntry = (text: string): ExceptionEntry => ({
  text,
  timestamp: Date.now(),
  details: {
    exceptionId: 1,
    text,
    lineNumber: 0,
    columnNumber: 0,
  },
});
