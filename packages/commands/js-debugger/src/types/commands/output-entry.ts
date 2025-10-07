import type { ConsoleEntry } from '../output/console-entry';
import type { ExceptionEntry } from '../output/exception-entry';
import type { StdioEntry } from '../output/stdio-entry';

/**
 * Cursor value representing ordering within the buffered output stream.
 *
 * The debugger increments the cursor for each stored entry, allowing callers
 * to page deterministically without re-downloading previously seen data.
 */
export type OutputCursor = number;

export type StdioOutputEntry = {
  /** Source stream identifier. */
  kind: 'stdio';
  /** Monotonic cursor associated with this entry. */
  cursor: OutputCursor;
  /** Captured stdout/stderr data. */
  entry: StdioEntry;
};

export type ConsoleOutputEntry = {
  /** Source stream identifier. */
  kind: 'console';
  /** Monotonic cursor associated with this entry. */
  cursor: OutputCursor;
  /** Console message payload. */
  entry: ConsoleEntry;
};

export type ExceptionOutputEntry = {
  /** Source stream identifier. */
  kind: 'exception';
  /** Monotonic cursor associated with this entry. */
  cursor: OutputCursor;
  /** Runtime exception details. */
  entry: ExceptionEntry;
};

/**
 * Tagged union describing the origin of a returned output record.
 */
export type OutputEntry = StdioOutputEntry | ConsoleOutputEntry | ExceptionOutputEntry;
