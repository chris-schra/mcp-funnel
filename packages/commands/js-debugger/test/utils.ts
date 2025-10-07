import { waitFor } from './utils/async-helpers.js';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import type { DebugSessionId } from '../src/types/index.js';
import {
  type FixtureHandle,
  prepareNodeFixture,
} from './utils/fixture-manager.js';
import { cleanupSession } from './utils/session-helpers.js';

/**
 * Cleans up a debugger session and its associated fixture.
 * Uses graceful session cleanup (continue until terminated) rather than forced termination.
 * @param manager - The debugger session manager
 * @param sessionId - The session ID to clean up
 * @param fixture - The fixture handle to clean up
 */
export async function sessionCleanup(
  manager: DebuggerSessionManager,
  sessionId: DebugSessionId | undefined,
  fixture: FixtureHandle | undefined,
) {
  await cleanupSession(manager, sessionId);
  if (fixture) {
    await fixture.cleanup();
  }
}

/**
 * Creates a test fixture with a debugger session.
 * @param filename - The fixture filename to load
 * @returns A promise that resolves to the fixture handle with session details
 */
export async function createFixture(filename: string) {
  const manager = new DebuggerSessionManager();
  const fixture = await prepareNodeFixture(filename);

  const response = await manager.startSession({
    target: {
      type: 'node',
      entry: fixture.tempPath,
      useTsx: true,
    },
    resumeAfterConfigure: false,
  });

  const sessionId = response.session.id;

  await waitFor(
    () => {
      const snapshot = manager.getSnapshot(sessionId);
      return snapshot.session.state.status === 'paused' ? true : null;
    },
    { timeoutMs: 5000 },
  );

  return {
    fixture,
    sessionId,
    response,
    manager,
    cleanup: async () => sessionCleanup(manager, sessionId, fixture),
  };
}
