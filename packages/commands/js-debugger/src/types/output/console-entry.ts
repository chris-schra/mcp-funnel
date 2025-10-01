import type { ConsoleArgument } from './console-argument';
import type { ConsoleEntryOrigin } from './console-entry-origin';
import type { ConsoleLevel } from './console-level';
import type { StackTrace } from '../cdp/stack-trace';

/**
 * Buffered console message emitted by the debug target.
 */
export interface ConsoleEntry {
  level: ConsoleLevel;
  origin: ConsoleEntryOrigin;
  text: string;
  arguments: ConsoleArgument[];
  timestamp: number;
  stackTrace?: StackTrace;
}
