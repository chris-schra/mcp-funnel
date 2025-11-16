import type { BreakpointSummary } from './breakpoint-summary';
import type { CommandAcknowledgment } from './command-acknowledgment';
import type { DebugSessionDescriptor } from '../session/debug-session-descriptor';
import type { PauseDetails } from './pause-details';

/**
 * Result returned from executing a debugger command.
 */
export interface DebuggerCommandResult {
  /** Session descriptor reflecting the latest state. */
  session: DebugSessionDescriptor;
  /**
   * Acknowledgment that the command was sent to CDP.
   *
   * This confirms the command was accepted but does NOT guarantee the intended
   * state change has occurred. CDP is asynchronous - use the session state to
   * determine actual execution state.
   */
  commandAck: CommandAcknowledgment;
  /** Breakpoints added or updated prior to executing the command. */
  setBreakpoints?: BreakpointSummary[];
  /** Identifiers of breakpoints removed as part of the command. */
  removedBreakpoints?: string[];
  /**
   * Pause information when execution stops.
   *
   * Only present if the command resulted in an immediate pause that was
   * confirmed by CDP. For async operations, check the session state instead.
   */
  pause?: PauseDetails;
}
