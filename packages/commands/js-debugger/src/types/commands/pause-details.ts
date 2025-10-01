import type { DebuggerCallFrame } from '../cdp/debugger-call-frame';
import type { StackTrace } from '../cdp/stack-trace';

/**
 * Information captured when the debugger reports a pause event.
 */
export interface PauseDetails {
  /** Reason provided by the runtime (e.g., breakpoint, step, exception). */
  reason: string;
  /** Full call stack at the pause location. */
  callFrames: DebuggerCallFrame[];
  /** Identifiers of breakpoints responsible for the pause, if any. */
  hitBreakpoints?: string[];
  /** Runtime-provided payload with additional context. */
  data?: Record<string, unknown>;
  /** Async stack trace linked to the pause, when available. */
  asyncStackTrace?: StackTrace;
}
