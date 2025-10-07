import { DebuggerSessionManager } from '../../src/debugger/session-manager.js';
import { waitFor } from './async-helpers.js';
import type {
  DebugSessionConfig,
  PauseDetails,
  ScopeQuery,
  ScopeQueryResult,
} from '../../src/types/index.js';

/**
 * Helper to start a debugging session and pause at the debugger statement.
 *
 * @param manager - The session manager instance
 * @param fixturePath - Path to the fixture file
 * @param useTsx - Whether to use tsx for TypeScript
 * @returns Promise resolving to session ID and pause details
 */
export async function startAndPause(
  manager: DebuggerSessionManager,
  fixturePath: string,
  useTsx = false,
): Promise<{ sessionId: string; pauseDetails: PauseDetails }> {
  const config: DebugSessionConfig = {
    target: {
      type: 'node',
      entry: fixturePath,
      useTsx,
    },
    resumeAfterConfigure: true,
  };

  const response = await manager.startSession(config);
  const sessionId = response.session.id;

  const pauseDetails = await waitFor(
    async () => {
      const snapshot = manager.getSnapshot(sessionId);
      if (snapshot.session.state.status === 'paused') {
        const result = await manager.runCommand({
          sessionId,
          action: 'pause',
        });
        return result.pause ?? null;
      }
      return null;
    },
    { timeoutMs: 15000, intervalMs: 100 },
  );

  return { sessionId, pauseDetails };
}

/**
 * Helper to get scope variables with given query parameters.
 *
 * @param manager - The session manager instance
 * @param sessionId - The debug session identifier
 * @param callFrameId - The call frame identifier from pause details
 * @param scopeNumber - The zero-based index in the call frame's scope chain
 * @param options - Additional query options (depth, path, maxProperties)
 * @returns Promise resolving to scope query results with variables and metadata
 */
export async function getScopeVars(
  manager: DebuggerSessionManager,
  sessionId: string,
  callFrameId: string,
  scopeNumber: number,
  options: Partial<
    Omit<ScopeQuery, 'sessionId' | 'callFrameId' | 'scopeNumber'>
  > = {},
): Promise<ScopeQueryResult> {
  return manager.getScopeVariables({
    sessionId,
    callFrameId,
    scopeNumber,
    ...options,
  });
}
