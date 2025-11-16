import type { DebugSessionId } from '../session/debug-session-id';
import type { BreakLocationSpec } from './break-location-spec';
import type { BreakpointMutation } from './breakpoint-mutation';

/**
 * Shared options present on every debugger command invocation.
 */
interface DebuggerCommandBase {
  /** Session identifier the command should be applied to. */
  sessionId: DebugSessionId;
  /**
   * Optional breakpoint adjustments performed right before the action runs.
   * Allows the caller to set or remove breakpoints without issuing a
   * dedicated command, minimising round-trips.
   */
  breakpoints?: BreakpointMutation;
}

/** Command to resume execution until the next pause. */
export type ContinueCommand = DebuggerCommandBase & {
  action: 'continue';
};

/** Command to request an immediate pause. */
export type PauseCommand = DebuggerCommandBase & {
  action: 'pause';
};

/** Single-step into the next function call. */
export type StepIntoCommand = DebuggerCommandBase & {
  action: 'stepInto';
};

/** Single-step over the current statement. */
export type StepOverCommand = DebuggerCommandBase & {
  action: 'stepOver';
};

/** Step out of the current call frame. */
export type StepOutCommand = DebuggerCommandBase & {
  action: 'stepOut';
};

/** Continue execution until a given source location is reached. */
export type ContinueToLocationCommand = DebuggerCommandBase & {
  action: 'continueToLocation';
  /** Target location to stop at. */
  location: BreakLocationSpec;
};

/**
 * Union of execution control commands understood by the debugger tool.
 */
export type DebuggerCommand =
  | ContinueCommand
  | PauseCommand
  | StepIntoCommand
  | StepOverCommand
  | StepOutCommand
  | ContinueToLocationCommand;
