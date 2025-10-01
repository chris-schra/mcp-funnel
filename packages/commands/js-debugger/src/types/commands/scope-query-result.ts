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
   * True when the server trimmed the payload (because of `maxProperties` or
   * overall response size guards). Callers should re-issue a narrower query
   * when this flag is set.
   */
  truncated: boolean;
  /**
   * Optional guidance emitted by the debugger runtime (e.g., reminders to
   * drill into nested properties). Presented inline so agents do not need to
   * cross-reference console output.
   */
  messages?: string[];
}
