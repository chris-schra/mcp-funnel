/**
 * Activity tracking utilities for debug sessions
 * Handles metadata updates for session activity and state changes
 */

import type {
  DebugState,
  SessionMetadata,
  SessionLifecycleState,
} from '../types/index.js';

/**
 * Context for activity tracking operations
 */
export interface ActivityContext {
  metadata: SessionMetadata;
  state: DebugState;
  lifecycleState: SessionLifecycleState;
}

/**
 * Result of activity update
 */
export interface ActivityUpdate {
  metadata: SessionMetadata;
  timestamp: string;
}

/**
 * Activity tracking operations for debug sessions
 */
export class ActivityTracker {
  /**
   * Update activity metadata with current timestamp and increment count
   */
  static updateActivity(
    metadata: SessionMetadata,
  ): Pick<SessionMetadata, 'lastActivityAt' | 'activityCount'> {
    const now = new Date().toISOString();
    return {
      lastActivityAt: now,
      activityCount: metadata.activityCount + 1,
    };
  }

  /**
   * Update state and activity together
   * Returns updated metadata properties
   */
  static updateStateAndActivity(
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
   * Get current timestamp in ISO format
   */
  static getCurrentTimestamp(): string {
    return new Date().toISOString();
  }
}
