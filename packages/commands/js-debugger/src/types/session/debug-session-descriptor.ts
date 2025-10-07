import type { DebugSessionId } from './debug-session-id';
import type { DebugTargetSummary } from './debug-target-summary';
import type { InspectorEndpoint } from './inspector-endpoint';
import type { SessionState } from './session-state';

/**
 * Lightweight description of a debugger session suitable for MCP responses.
 */
export interface DebugSessionDescriptor {
  id: DebugSessionId;
  target: DebugTargetSummary;
  /**
   * Rich session state that explicitly models CDP's async nature.
   *
   * Use this to determine the actual execution state and whether the session
   * is in a transitioning state waiting for CDP to confirm a command.
   */
  state: SessionState;
  createdAt: number;
  updatedAt: number;
  inspector?: InspectorEndpoint;
  pid?: number;
}
