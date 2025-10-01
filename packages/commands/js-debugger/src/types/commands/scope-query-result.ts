import type { RemoteObjectSummary } from '../cdp/remote-object-summary';
import type { ScopePathSegment } from './scope-path-segment';

/**
 * Single variable entry returned from a scope query.
 */
export interface ScopeVariable {
    /** Name of the property or binding. */
    name: string;
    /**
     * Rendered remote object data for the variable value, including any
     * descriptive text and handles necessary for follow-up expansion.
     */
    value: RemoteObjectSummary;
    /**
     * Nested children collected when a depth greater than one was requested.
     */
    children?: ScopeVariable[];
    /**
     * Indicates whether child collection was truncated due to `maxProperties`.
     */
    truncated?: boolean;
}

/**
 * Response payload for a scope variable inspection.
 */
export interface ScopeQueryResult {
    /** The original navigation path resolved for this result. */
    path: ScopePathSegment[];
    /** Collected variables at the requested depth. */
    variables: ScopeVariable[];
    /**
     * True when additional properties were available but trimmed due to the
     * `maxProperties` limit. Callers can re-issue a query with different bounds.
     */
    truncated: boolean;
}
