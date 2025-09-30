/**
 * Activity tracking utilities for debug sessions.
 * Provides immutable update operations for session activity metadata,
 * tracking timestamps and activity counts without side effects.
 * @public
 * @see file:../enhanced-debug-session.ts:505-547 - Usage in session state updates
 */

import type {
  DebugState,
  SessionMetadata,
  SessionLifecycleState,
} from '../types/index.js';

/**
 * Context for activity tracking operations.
 * @public
 */
export interface ActivityContext {
  /** Current session metadata */
  metadata: SessionMetadata;
  /** Current debug execution state */
  state: DebugState;
  /** Current session lifecycle state */
  lifecycleState: SessionLifecycleState;
}

/**
 * Result of activity update operation.
 * @public
 */
export interface ActivityUpdate {
  /** Updated session metadata */
  metadata: SessionMetadata;
  /** ISO 8601 timestamp of the update */
  timestamp: string;
}

/**
 * Activity tracking operations for debug sessions.
 * Provides pure functions for updating session activity metadata. All methods
 * return new objects without mutating input parameters.
 * @example
 * ```typescript
 * // Update activity timestamp and counter
 * const updates = ActivityTracker.updateActivity(metadata);
 * Object.assign(metadata, updates);
 * ```
 * @public
 * @see file:../types/session.ts:13-22 - SessionMetadata interface
 */
export class ActivityTracker {
  /**
   * Updates activity metadata with current timestamp and incremented counter.
   * Returns a partial metadata object containing only the updated fields.
   * Does not mutate the input metadata parameter.
   * @param metadata - Current session metadata to derive updates from
   * @returns Partial metadata object with updated lastActivityAt timestamp and incremented activityCount
   * @example
   * ```typescript
   * const updates = ActivityTracker.updateActivity(session.metadata);
   * Object.assign(session.metadata, updates);
   * ```
   * @public
   * @see file:../enhanced-debug-session.ts:545-548 - Usage in private updateActivity method
   */
  public static updateActivity(
    metadata: SessionMetadata,
  ): Pick<SessionMetadata, 'lastActivityAt' | 'activityCount'> {
    const now = new Date().toISOString();
    return {
      lastActivityAt: now,
      activityCount: metadata.activityCount + 1,
    };
  }

  /**
   * Updates both debug state and activity metadata atomically.
   * Convenience method that combines state transition with activity tracking.
   * Returns both the new state and metadata updates in a single operation.
   * @param metadata - Current session metadata
   * @param state - New debug state to transition to
   * @returns Object containing metadata updates (lastActivityAt and activityCount) and the new state
   * @example
   * ```typescript
   * const updates = ActivityTracker.updateStateAndActivity(
   *   session.metadata,
   *   'paused'
   * );
   * session.state = updates.state;
   * Object.assign(session.metadata, updates.metadata);
   * ```
   * @public
   * @see file:../enhanced-debug-session.ts:505-512 - Usage in updateState method
   */
  public static updateStateAndActivity(
    metadata: SessionMetadata,
    state: DebugState,
  ): {
    metadata: Pick<SessionMetadata, 'lastActivityAt' | 'activityCount'>;
    state: DebugState;
  } {
    return {
      metadata: ActivityTracker.updateActivity(metadata),
      state,
    };
  }

  /**
   * Returns current timestamp in ISO 8601 format.
   * @returns ISO 8601 formatted timestamp string (e.g., "2025-09-30T12:00:00.000Z")
   * @public
   */
  public static getCurrentTimestamp(): string {
    return new Date().toISOString();
  }
}
