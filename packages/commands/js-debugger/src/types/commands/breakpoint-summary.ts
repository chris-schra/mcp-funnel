import type { BreakpointLocation } from './breakpoint-location';
import type { BreakpointSpec } from './breakpoint-spec';

/**
 * Resolved breakpoint information returned to callers.
 */
export interface BreakpointSummary {
    /** Canonical identifier returned by the debugger. */
    id: string;
    /** Original breakpoint request submitted by the caller. */
    requested: BreakpointSpec;
    /** Locations the runtime resolved the breakpoint to. */
    resolvedLocations: BreakpointLocation[];
}
