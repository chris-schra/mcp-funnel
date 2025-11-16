import type { VitestSessionManager } from '../../src/session/session-manager.js';
import type { SessionStatus } from '../../src/types/session.js';
import { waitFor, type WaitOptions } from './async-helpers.js';

/**
 * Waits for a vitest session to reach one of the specified statuses.
 * @param manager - The session manager instance
 * @param sessionId - ID of the session to wait for
 * @param status - Single status or array of acceptable statuses
 * @param options - Optional wait configuration
 * @throws When the timeout is exceeded without reaching desired status
 * @internal
 */
export async function waitForSessionStatus(
  manager: VitestSessionManager,
  sessionId: string,
  status: SessionStatus | SessionStatus[],
  options?: WaitOptions,
): Promise<void> {
  const statuses = Array.isArray(status) ? status : [status];

  await waitFor(() => {
    const session = manager.getSessionStatus(sessionId);
    return statuses.includes(session.status) ? true : null;
  }, options);
}

/**
 * Waits for a vitest session to complete (either 'completed', 'timeout', or 'killed').
 * @param manager - The session manager instance
 * @param sessionId - ID of the session to wait for
 * @param options - Optional wait configuration (defaults to 30000ms timeout)
 * @throws When the timeout is exceeded without completion
 * @internal
 */
export async function waitForSessionCompletion(
  manager: VitestSessionManager,
  sessionId: string,
  options?: WaitOptions,
): Promise<void> {
  await waitForSessionStatus(manager, sessionId, ['completed', 'timeout', 'killed'], {
    timeoutMs: 30000,
    ...options,
  });
}

/**
 * Cleans up a vitest session by closing the vitest instance and removing session data.
 * Handles sessions that may have already completed or been terminated.
 * @param manager - The session manager instance
 * @param sessionId - ID of the session to clean up
 * @internal
 */
export async function cleanupSession(
  manager: VitestSessionManager,
  sessionId: string | undefined,
): Promise<void> {
  if (!sessionId) return;

  try {
    // Use the manager's cleanup method to properly close vitest instance
    await manager.cleanupSession(sessionId);
  } catch (error) {
    // Session may have already been removed or errored
    if (error instanceof Error && !error.message.includes('not found')) {
      console.warn(`Cleanup warning for session ${sessionId}:`, error);
    }
  }
}
