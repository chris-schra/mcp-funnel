import type { DebugState } from './debug-state.js';
import type { ConsoleMessage } from './console.js';
import type { BreakpointRegistration } from './breakpoint.js';

// Event-driven session events with Emittery
export interface DebugSessionEvents {
  paused: DebugState;
  resumed: void;
  console: ConsoleMessage;
  terminated: void;
  breakpointResolved: BreakpointRegistration;
  error: Error;
}

export type PauseHandler = (state: DebugState) => void;
export type ResumeHandler = () => void;
