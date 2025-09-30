import { DebugSession, SessionCleanupConfig } from '../types/index.js';
import { SessionActivityTracker } from './session-activity-tracker.js';

/**
 * Identify and cleanup inactive sessions
 */
export async function cleanupInactiveSessions(
  sessions: Map<string, DebugSession>,
  activityTracker: SessionActivityTracker,
  cleanupConfig: SessionCleanupConfig,
  deleteSessionCallback: (sessionId: string) => void,
): Promise<number> {
  let cleanedCount = 0;
  const sessionsToCleanup: string[] = [];

  for (const [sessionId, session] of sessions) {
    const isInactive = !activityTracker.isSessionActive(
      sessionId,
      cleanupConfig.sessionTimeoutMs,
    );

    const hasExceededMemoryThreshold =
      session.metadata &&
      session.metadata.resourceUsage.memoryEstimate >
        cleanupConfig.memoryThresholdBytes;

    if (isInactive || hasExceededMemoryThreshold) {
      sessionsToCleanup.push(sessionId);
    }
  }

  for (const sessionId of sessionsToCleanup) {
    try {
      console.info(`Cleaning up inactive session: ${sessionId}`);
      deleteSessionCallback(sessionId);
      cleanedCount++;
    } catch (error) {
      console.warn(`Failed to cleanup session ${sessionId}:`, error);
    }
  }

  return cleanedCount;
}
