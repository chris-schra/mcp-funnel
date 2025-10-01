import type { BreakpointLocation } from './breakpoint-location';

/**
 * User-facing breakpoint configuration.
 */
export interface BreakpointSpec {
    /**
     * Source position where the breakpoint should be installed. Either a
     * `scriptId` or `url` must be provided on the location.
     */
    location: BreakpointLocation;
    /**
     * Optional JavaScript expression evaluated within the debuggee context to
     * decide whether the breakpoint should actually pause execution.
     */
    condition?: string;
}
