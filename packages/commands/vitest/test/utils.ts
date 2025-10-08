import { VitestSessionManager } from '../src/session/session-manager.js';
import type { VitestSessionConfig } from '../src/types/index.js';
import { type FixtureHandle, prepareVitestFixture } from './utils/fixture-manager.js';
import { cleanupSession } from './utils/session-helpers.js';

/**
 * Result from creating a vitest fixture with session.
 * Provides access to the manager, session ID, fixture handle, and cleanup function.
 * @public
 */
export interface VitestFixtureResult {
  /** The vitest session manager instance */
  manager: VitestSessionManager;
  /** The session ID for the running test session */
  sessionId: string;
  /** Handle to the fixture project with cleanup capability */
  fixture: FixtureHandle;
  /** Cleanup function to close session and remove fixture files */
  cleanup: () => Promise<void>;
}

/**
 * Cleans up a vitest session and its associated fixture.
 * Uses graceful session cleanup followed by fixture cleanup.
 * @param manager - The vitest session manager
 * @param sessionId - The session ID to clean up
 * @param fixture - The fixture handle to clean up
 * @internal
 */
async function sessionCleanup(
  manager: VitestSessionManager,
  sessionId: string | undefined,
  fixture: FixtureHandle | undefined,
): Promise<void> {
  await cleanupSession(manager, sessionId);
  if (fixture) {
    await fixture.cleanup();
  }
}

/**
 * Creates a test fixture with a vitest session.
 * Ensures resources are tracked and cleaned up even if initialization fails.
 *
 * This is the main factory function for integration tests that need to run
 * REAL vitest sessions against fixture projects.
 * @param fixtureName - The fixture directory name (e.g., 'basic-project', 'failing-tests')
 * @param config - Optional session configuration overrides
 * @returns A promise that resolves to the fixture result with session details
 * @throws When fixture preparation or session start fails
 * @example
 * ```typescript
 * const { manager, sessionId, fixture, cleanup } = await createVitestFixture('basic-project');
 * try {
 *   // Wait for completion and get results
 *   const results = manager.getResults({ sessionId });
 *   expect(results.summary.passed).toBeGreaterThan(0);
 * } finally {
 *   await cleanup();
 * }
 * ```
 * @public
 */
export async function createVitestFixture(
  fixtureName: string,
  config: Partial<VitestSessionConfig> = {},
): Promise<VitestFixtureResult> {
  const manager = new VitestSessionManager();
  let fixture: FixtureHandle | undefined;
  let sessionId: string | undefined;
  let cleanupCalled = false;

  const cleanup = async () => {
    if (cleanupCalled) return;
    cleanupCalled = true;

    try {
      await sessionCleanup(manager, sessionId, fixture);
    } catch (error) {
      console.warn('Cleanup error in createVitestFixture:', error);
      // Force cleanup on error
      if (fixture) {
        try {
          await fixture.cleanup();
        } catch {
          // Ignore errors during fixture cleanup
        }
      }
    } finally {
      // Always destroy manager to clear intervals and close sessions
      await manager.destroy();
    }
  };

  try {
    // Prepare fixture project
    fixture = await prepareVitestFixture(fixtureName);

    // Start vitest session with fixture paths
    // tempPath: where tests execute (temp directory)
    // Fixtures run without configs (configs are not copied to temp)
    const response = await manager.startSession({
      root: fixture.tempPath,
      ...config,
    });

    sessionId = response.sessionId;

    return {
      fixture,
      sessionId,
      manager,
      cleanup,
    };
  } catch (error) {
    // Ensure cleanup on initialization failure
    await cleanup();
    throw error;
  }
}
