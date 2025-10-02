import type { ConsoleEntry } from './console-entry';
import type { ExceptionEntry } from './exception-entry';
import type { StdioEntry } from './stdio-entry';

/**
 * Point-in-time snapshot of buffered target output streams.
 */
export interface OutputBufferSnapshot {
  stdio: StdioEntry[];
  console: ConsoleEntry[];
  exceptions: ExceptionEntry[];
}
