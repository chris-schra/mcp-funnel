import type { EnhancedDebugSession } from '../enhanced-debug-session.js';
import type { SessionResourceTracker } from './resource-tracker.js';
import type { SessionActivityTracker } from './activity-tracker.js';

/**
 * Context containing cleanup state and trackers for session cleanup operations.
 *
 * Provides access to session timeout handles, resource tracking, and activity monitoring
 * needed to properly clean up debug sessions and their associated resources.
 * @see file:./session-cleanup-utils.ts:19 - cleanupEnhancedSession implementation
 * @public
 */
export interface SessionCleanupContext {
  /** Map of session IDs to their timeout handles for clearing */
  sessionTimeouts: Map<string, NodeJS.Timeout>;
  /** Resource tracker for releasing session resources */
  resourceTracker: SessionResourceTracker;
  /** Activity tracker for removing session activity history */
  activityTracker: SessionActivityTracker;
}

/**
 * Performs comprehensive cleanup of an enhanced debug session and its resources.
 *
 * Clears session timeouts, releases all tracked resources (processes, connections, timers),
 * removes activity tracking data, and terminates the debug session adapter connection.
 * Errors during cleanup are logged but do not propagate to prevent partial cleanup states.
 * @param session - The debug session to clean up
 * @param context - Cleanup context containing timeout, resource, and activity trackers
 * @example
 * ```typescript
 * await cleanupEnhancedSession(enhancedSession, {
 *   sessionTimeouts: this.sessionTimeouts,
 *   resourceTracker: this.resourceTracker,
 *   activityTracker: this.activityTracker,
 * });
 * ```
 * @see file:../../session-manager.ts:450 - Called during session termination
 * @see file:../enhanced-debug-session.ts:210-240 - Session terminate implementation
 * @public
 */
export async function cleanupEnhancedSession(
  session: EnhancedDebugSession,
  context: SessionCleanupContext,
): Promise<void> {
  try {
    // Clear all timeouts
    const timeout = context.sessionTimeouts.get(session.id);
    if (timeout) {
      clearTimeout(timeout);
      context.sessionTimeouts.delete(session.id);
    }

    // Release all tracked resources
    const resources = context.resourceTracker.getAllResources(session.id);
    for (const resource of resources) {
      context.resourceTracker.releaseResource(session.id, resource.id);
    }

    // Remove from activity tracker
    context.activityTracker.removeSession(session.id);

    // Terminate the enhanced session (this handles adapter disconnection)
    await session.terminate();
  } catch (error) {
    console.error(
      `Error during cleanup of enhanced session ${session.id}:`,
      error,
    );
  }
}

/**
 * Configures timeout and resource tracking for an enhanced debug session.
 *
 * Initializes the session's built-in timeout mechanism and registers the timeout
 * as a tracked resource for later cleanup. Heartbeat functionality is handled
 * internally by EnhancedDebugSession and does not require external setup.
 *
 * This function delegates timeout management to the session's internal implementation
 * while ensuring the timeout is properly tracked as a resource for cleanup purposes.
 * @param session - The debug session to configure
 * @param timeoutMs - Timeout duration in milliseconds before session auto-termination
 * @param resourceTracker - Resource tracker for registering the timeout handle
 * @example
 * ```typescript
 * const timeoutMs = request.timeout || 30000;
 * setupEnhancedSessionTimeouts(
 *   enhancedSession,
 *   timeoutMs,
 *   this.resourceTracker
 * );
 * ```
 * @see file:../../session-manager.ts:293 - Called during session creation
 * @see file:../enhanced-debug-session.ts:150-170 - Session setupTimeout implementation
 * @public
 */
export function setupEnhancedSessionTimeouts(
  session: EnhancedDebugSession,
  timeoutMs: number,
  resourceTracker: SessionResourceTracker,
): void {
  // Use the enhanced session's built-in timeout functionality
  session.setupTimeout(timeoutMs);

  // Track timeout as a resource
  resourceTracker.trackResource(session.id, `timeout-${session.id}`, 'timer');

  // Note: Heartbeat functionality is now handled internally by EnhancedDebugSession
}
