import type { BreakpointSummary } from './breakpoint-summary';
import type { DebugSessionDescriptor } from '../session/debug-session-descriptor';
import type { PauseDetails } from './pause-details';

/**
 * Result returned from executing a debugger command.
 */
export interface DebuggerCommandResult {
  /** Session descriptor reflecting the latest state. */
  session: DebugSessionDescriptor;
  /** Breakpoints added or updated prior to executing the command. */
  setBreakpoints?: BreakpointSummary[];
  /** Identifiers of breakpoints removed as part of the command. */
  removedBreakpoints?: string[];
  /** Pause information when execution stops. */
  pause?: PauseDetails;
  /** Indicates that execution resumed and is currently running. */
  resumed?: boolean;
}
