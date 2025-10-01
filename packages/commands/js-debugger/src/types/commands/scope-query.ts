import type { ScopePathSegment } from './scope-path-segment';

/**
 * Parameters controlling how variables are fetched for a specific scope.
 */
export interface ScopeQuery {
    /**
     * Identifier of the debugger session containing the paused call frame.
     */
    sessionId: string;

    /**
     * Identifier of the paused call frame whose scope is being inspected.
     * Matches the `callFrameId` provided by `Debugger.paused`.
     */
    callFrameId: string;

    /**
     * Zero-based index into the scope chain for the selected call frame.
     */
    scopeNumber: number;

    /**
     * Optional path describing which nested property to expand before reading
     * child variables. When omitted, the top-level scope object is returned.
     *
     * String entries act as shorthand for `{ property: "name" }`, while
     * `{ index }` entries address array-like collections.
     */
    path?: ScopePathSegment[];

    /**
     * Maximum traversal depth starting from the resolved object. Defaults to 1
     * to avoid flooding the caller with large graphs. Depth includes the root
     * object itself.
     */
    depth?: number;

    /**
     * Upper bound on the number of properties collected at each depth level.
     * Helps guard against massive globals or process objects.
     */
    maxProperties?: number;
}
