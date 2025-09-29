import { DebugSession, SessionCleanupConfig } from '../types/index.js';
import { SessionResourceTracker } from './session-resource-tracker.js';
import { SessionActivityTracker } from './session-activity-tracker.js';

/**
 * Setup enhanced session timeout and heartbeat handling
 */
export function setupSessionTimeout(
  sessionId: string,
  sessions: Map<string, DebugSession>,
  sessionTimeouts: Map<string, NodeJS.Timeout>,
  resourceTracker: SessionResourceTracker,
  cleanupConfig: SessionCleanupConfig,
  requestTimeoutMs?: number,
  onTimeout?: (sessionId: string) => void,
): void {
  const session = sessions.get(sessionId);
  if (!session || !session.cleanup) return;

  // Use request timeout or default config timeout
  const timeoutMs = requestTimeoutMs || cleanupConfig.sessionTimeoutMs;

  // Session timeout
  const sessionTimeout = setTimeout(() => {
    const currentSession = sessions.get(sessionId);
    if (currentSession) {
      console.info(`Session ${sessionId} timed out after ${timeoutMs}ms`);
      currentSession.lifecycleState = 'terminating';
      currentSession.state = { status: 'terminated' };
      if (onTimeout) {
        onTimeout(sessionId);
      }
    }
  }, timeoutMs);

  session.cleanup.timeoutHandle = sessionTimeout;
  sessionTimeouts.set(sessionId, sessionTimeout);

  // Track timeout as a resource
  resourceTracker.trackResource(sessionId, `timeout-${sessionId}`, 'timer');
}

/**
 * Setup heartbeat mechanism for session
 */
export function setupHeartbeat(
  sessionId: string,
  sessions: Map<string, DebugSession>,
  resourceTracker: SessionResourceTracker,
  activityTracker: SessionActivityTracker,
  cleanupConfig: SessionCleanupConfig,
): void {
  const session = sessions.get(sessionId);
  if (!session || !session.cleanup) return;

  const heartbeatInterval = setInterval(() => {
    const currentSession = sessions.get(sessionId);
    if (currentSession && currentSession.metadata) {
      // Record heartbeat activity
      activityTracker.recordActivity(sessionId, 'heartbeat');
      currentSession.metadata.lastHeartbeatAt = new Date().toISOString();

      // Check if session is still responsive
      if (currentSession.lifecycleState === 'active') {
        try {
          // For real sessions, we could ping the adapter
          // For now, just verify the adapter is still connected
          if (!currentSession.adapter) {
            console.warn(`Session ${sessionId} lost adapter connection`);
            currentSession.lifecycleState = 'inactive';
          }
        } catch (error) {
          console.warn(
            `Heartbeat check failed for session ${sessionId}:`,
            error,
          );
          currentSession.lifecycleState = 'inactive';
        }
      }
    }
  }, cleanupConfig.heartbeatIntervalMs);

  session.cleanup.heartbeatHandle = heartbeatInterval;
  // Track heartbeat timer as resource
  resourceTracker.trackResource(sessionId, `heartbeat-${sessionId}`, 'timer');
}
