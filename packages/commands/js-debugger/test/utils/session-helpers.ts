import type { DebuggerSessionManager } from '../../src/debugger/session-manager.js';
import type { NodeDebugTargetConfig, DebugSessionId } from '../../src/types/index.js';
import type { SessionStateStatus } from '../../src/types/session/session-state.js';
import { waitFor, sleep, type WaitOptions } from './async-helpers.js';

/**
 * Creates a NodeDebugTargetConfig with sensible defaults.
 * Automatically enables tsx for TypeScript files.
 * @param fixturePath - Path to the entry script
 * @param options - Optional overrides for the target configuration
 * @returns Configured NodeDebugTargetConfig
 * @internal
 */
export const createNodeTarget = (
  fixturePath: string,
  options?: Partial<NodeDebugTargetConfig>,
): NodeDebugTargetConfig => ({
  type: 'node',
  entry: fixturePath,
  useTsx: fixturePath.endsWith('.ts'),
  ...options,
});

/**
 * Waits for a debug session to reach one of the specified statuses.
 * Base abstraction for status-based waiting patterns.
 * @param manager - The session manager instance
 * @param sessionId - ID of the session to wait for
 * @param status - Single status or array of acceptable statuses
 * @param options - Optional wait configuration with allowNotFound flag
 * @throws When the timeout is exceeded without reaching desired status
 * @internal
 */
export async function waitForSessionStatus(
  manager: DebuggerSessionManager,
  sessionId: DebugSessionId,
  status: SessionStateStatus | SessionStateStatus[],
  options?: WaitOptions & { allowNotFound?: boolean },
): Promise<void> {
  const statuses = Array.isArray(status) ? status : [status];
  const { allowNotFound = false, ...waitOptions } = options ?? {};

  await waitFor(async () => {
    try {
      const snapshot = manager.getSnapshot(sessionId);
      return statuses.includes(snapshot.session.state.status) ? true : null;
    } catch (error) {
      if (allowNotFound && error instanceof Error && error.message.includes('not found')) {
        return true;
      }
      throw error;
    }
  }, waitOptions);
}

/**
 * Waits for a debug session to reach paused state.
 * @param manager - The session manager instance
 * @param sessionId - ID of the session to wait for
 * @param options - Optional wait configuration (defaults to 5000ms timeout)
 * @throws When the timeout is exceeded without pausing
 * @internal
 */
export const waitForPause = async (
  manager: DebuggerSessionManager,
  sessionId: DebugSessionId,
  options?: WaitOptions,
): Promise<void> => {
  await waitForSessionStatus(manager, sessionId, 'paused', options);
};

/**
 * Waits for a debug session to reach terminated state.
 * Handles both the case where the session exists and transitions to terminated,
 * and the case where the session is removed after termination.
 * @param manager - The session manager instance
 * @param sessionId - ID of the session to wait for
 * @param options - Optional wait configuration (defaults to 3000ms timeout)
 * @throws When the timeout is exceeded without termination
 * @internal
 */
export const waitForSessionTermination = async (
  manager: DebuggerSessionManager,
  sessionId: string,
  options?: WaitOptions,
): Promise<void> => {
  await waitForSessionStatus(manager, sessionId, 'terminated', {
    allowNotFound: true,
    timeoutMs: 3000,
    ...options,
  });
};

/**
 * Continues execution past any debugger statements until the session terminates.
 * This helper handles the common pattern of continuing through multiple debugger
 * statements in test fixtures until the process completes.
 * @param manager - The session manager instance
 * @param sessionId - ID of the session to continue
 * @param options - Optional wait configuration (defaults to 3000ms timeout)
 * @internal
 */
export const continueUntilTerminated = async (
  manager: DebuggerSessionManager,
  sessionId: DebugSessionId,
  options: WaitOptions = {},
): Promise<void> => {
  await waitFor(
    async () => {
      try {
        await sleep(50);
        const snapshot = manager.getSnapshot(sessionId);
        if (snapshot.session.state.status === 'paused') {
          await manager.runCommand({ sessionId, action: 'continue' });
          return null;
        }
        return snapshot.session.state.status === 'terminated' ||
          snapshot.session.state.status === 'running'
          ? true
          : null;
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return true;
        }
        throw error;
      }
    },
    { timeoutMs: 3000, ...options },
  ).catch(() => {
    // Ignore timeout, may already be in stable state
  });
};

/**
 * Cleans up a debug session by continuing to termination if still active.
 * Handles sessions that may have already terminated or been removed.
 * @param manager - The session manager instance
 * @param sessionId - ID of the session to clean up
 * @param options - Cleanup options
 * @param options.forceKill - If false, skip force kill on timeout (default: true)
 * @param options.timeoutMs - Graceful termination timeout in ms (default: 3000)
 * @internal
 */
export const cleanupSession = async (
  manager: DebuggerSessionManager,
  sessionId: DebugSessionId | undefined,
  options: { forceKill?: boolean; timeoutMs?: number } = {},
): Promise<void> => {
  if (!sessionId) return;

  const { forceKill = true, timeoutMs = 3000 } = options;

  try {
    const descriptor = manager.getDescriptor(sessionId);
    if (descriptor.state.status === 'terminated') {
      return;
    }

    // Try graceful termination with timeout
    try {
      await Promise.race([
        (async () => {
          await manager.runCommand({ sessionId, action: 'continue' });
          await waitForSessionTermination(manager, sessionId, {
            timeoutMs,
          });
        })(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Cleanup timeout')), timeoutMs),
        ),
      ]);
    } catch (_error) {
      // Graceful cleanup failed or timed out
      if (forceKill) {
        const session = manager.getSession(sessionId);
        if (session) {
          session.forceKill();
          // Give it a moment to process the kill signal
          await sleep(100);
        }
      }
    }
  } catch (error) {
    // Session may have already been removed or errored
    if (
      error instanceof Error &&
      !error.message.includes('not found') &&
      !error.message.includes('Cleanup timeout')
    ) {
      console.warn(`Cleanup warning for session ${sessionId}:`, error);
    }
  }
};
