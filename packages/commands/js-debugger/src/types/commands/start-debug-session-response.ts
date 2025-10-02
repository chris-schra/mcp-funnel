import type { BreakpointSummary } from './breakpoint-summary';
import type { DebugSessionDescriptor } from '../session/debug-session-descriptor';
import type { PauseDetails } from './pause-details';

/**
 * Payload returned after creating a new debugger session.
 */
export interface StartDebugSessionResponse {
  /** Descriptor describing the newly created session. */
  session: DebugSessionDescriptor;
  /** Breakpoints registered during startup. */
  breakpoints?: BreakpointSummary[];
  /** Initial pause information if the target remains paused. */
  initialPause?: PauseDetails;
}
