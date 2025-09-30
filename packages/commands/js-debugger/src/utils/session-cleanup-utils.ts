import { DebugSession } from '../types/index.js';
import { SessionResourceTracker } from './session-resource-tracker.js';
import { SessionActivityTracker } from './session-activity-tracker.js';

/**
 * Clean up a session with comprehensive resource management
 */
export function cleanupSessionResources(
  session: DebugSession,
  sessionTimeouts: Map<string, NodeJS.Timeout>,
  resourceTracker: SessionResourceTracker,
  activityTracker: SessionActivityTracker,
): void {
  try {
    // Update lifecycle state
    session.lifecycleState = 'terminating';

    // Clear all timeouts
    const timeout = sessionTimeouts.get(session.id);
    if (timeout) {
      clearTimeout(timeout);
      sessionTimeouts.delete(session.id);
    }

    // Clear session-specific timers
    if (session.cleanup?.timeoutHandle) {
      clearTimeout(session.cleanup.timeoutHandle);
    }
    if (session.cleanup?.heartbeatHandle) {
      clearInterval(session.cleanup.heartbeatHandle);
    }

    // Release all tracked resources
    const resources = resourceTracker.getAllResources(session.id);
    for (const resource of resources) {
      resourceTracker.releaseResource(session.id, resource.id);
    }

    // Remove from activity tracker
    activityTracker.removeSession(session.id);

    // Disconnect adapter
    session.adapter.disconnect().catch((error) => {
      console.warn(
        `Error disconnecting adapter for session ${session.id}:`,
        error,
      );
    });

    // Clear console output to free memory
    session.consoleOutput = [];

    // Update final state
    session.state = { status: 'terminated' };
    session.lifecycleState = 'terminated';
  } catch (error) {
    console.error(`Error during cleanup of session ${session.id}:`, error);
  }
}

/**
 * Force cleanup of oldest sessions to prevent resource exhaustion
 */
export function findOldestSessions(
  sessions: Map<string, DebugSession>,
  count: number,
): string[] {
  const sessionEntries = Array.from(sessions.entries()).sort((a, b) => {
    const aLastActivity = a[1].metadata?.lastActivityAt || a[1].startTime;
    const bLastActivity = b[1].metadata?.lastActivityAt || b[1].startTime;
    return (
      new Date(aLastActivity).getTime() - new Date(bLastActivity).getTime()
    );
  });

  return sessionEntries.slice(0, count).map(([sessionId]) => sessionId);
}
