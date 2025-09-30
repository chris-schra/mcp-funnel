import type { EnhancedDebugSession } from '../enhanced-debug-session.js';
import type { SessionResourceTracker } from './resource-tracker.js';
import type { SessionActivityTracker } from './activity-tracker.js';

/**
 * Context for session cleanup operations
 */
export interface SessionCleanupContext {
  sessionTimeouts: Map<string, NodeJS.Timeout>;
  resourceTracker: SessionResourceTracker;
  activityTracker: SessionActivityTracker;
}

/**
 * Clean up an enhanced debug session
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
 * Setup enhanced session timeout and heartbeat handling
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
