import type { DebugSessionId } from './debug-session-id';
import type { DebugSessionStatus } from './debug-session-status';
import type { DebugTargetSummary } from './debug-target-summary';
import type { InspectorEndpoint } from './inspector-endpoint';

/**
 * Lightweight description of a debugger session suitable for MCP responses.
 */
export interface DebugSessionDescriptor {
    id: DebugSessionId;
    target: DebugTargetSummary;
    status: DebugSessionStatus;
    createdAt: number;
    updatedAt: number;
    inspector?: InspectorEndpoint;
    pid?: number;
}
