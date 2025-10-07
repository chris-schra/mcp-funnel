import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import type {
  DebugSessionConfig,
  NodeDebugTargetConfig,
  StartDebugSessionResponse,
} from '../src/types/index.js';
import { waitFor } from './utils/async-helpers.js';
import {
  prepareNodeFixture,
  type FixtureHandle,
} from './utils/fixture-manager.js';

describe(
  'DebuggerSessionManager Integration Tests - Error Scenarios',
  () => {
    let manager: DebuggerSessionManager;
    const fixtures: FixtureHandle[] = [];

    beforeEach(() => {
      manager = new DebuggerSessionManager();
    });

    afterEach(async () => {
      // Clean up all fixtures
      await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
      fixtures.length = 0;
    });

    const createNodeTarget = (
      fixturePath: string,
      options?: Partial<NodeDebugTargetConfig>,
    ): NodeDebugTargetConfig => ({
      type: 'node',
      entry: fixturePath,
      useTsx: fixturePath.endsWith('.ts'),
      ...options,
    });

    const startSession = async (
      config: DebugSessionConfig,
    ): Promise<StartDebugSessionResponse> => {
      return manager.startSession(config);
    };

    describe('Error Scenarios', () => {
      it('should reject invalid script paths', async () => {
        const target = createNodeTarget('/nonexistent/path/to/script.js');

        const response = await startSession({
          target,
        });

        const sessionId = response.session.id;

        // Session starts but should fail/terminate due to invalid path
        const didTerminate = await waitFor(
          async () => {
            try {
              const snapshot = manager.getSnapshot(sessionId);
              return snapshot.session.state.status === 'terminated'
                ? true
                : null;
            } catch (error) {
              if (
                error instanceof Error &&
                error.message.includes('not found')
              ) {
                return true;
              }
              throw error;
            }
          },
          { timeoutMs: 15000 },
        );

        expect(didTerminate).toBe(true);
      });

      it('should reject duplicate session IDs', async () => {
        const fixture = await prepareNodeFixture('console-output.js');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.tempPath);
        const sessionId = 'duplicate-session-id';

        await startSession({
          id: sessionId,
          target,
          resumeAfterConfigure: true,
        });

        await expect(
          startSession({
            id: sessionId,
            target,
            resumeAfterConfigure: true,
          }),
        ).rejects.toThrow(/already exists/i);
      });

      it('should reject commands for non-existent sessions', async () => {
        const nonExistentSessionId = 'non-existent-session-id';

        await expect(
          manager.runCommand({
            sessionId: nonExistentSessionId,
            action: 'continue',
          }),
        ).rejects.toThrow(/not found/i);

        await expect(
          manager.queryOutput({
            sessionId: nonExistentSessionId,
          }),
        ).rejects.toThrow(/not found/i);

        await expect(
          manager.getScopeVariables({
            sessionId: nonExistentSessionId,
            callFrameId: 'fake-frame',
            scopeNumber: 0,
          }),
        ).rejects.toThrow(/not found/i);
      });

      it('should handle process crashes gracefully', async () => {
        const fixture = await prepareNodeFixture('console-output.js');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.tempPath);
        const response = await startSession({
          target,
          resumeAfterConfigure: true,
        });

        const sessionId = response.session.id;

        // Wait for the process to terminate naturally
        await waitFor(
          async () => {
            try {
              const snapshot = manager.getSnapshot(sessionId);
              return snapshot.session.state.status === 'terminated'
                ? true
                : null;
            } catch (error) {
              if (
                error instanceof Error &&
                error.message.includes('not found')
              ) {
                return true;
              }
              throw error;
            }
          },
          { timeoutMs: 5000 },
        );

        // Attempting to run commands on terminated session should fail
        await expect(
          manager.runCommand({
            sessionId,
            action: 'continue',
          }),
        ).rejects.toThrow();
      });

      it('should timeout on operations that take too long', async () => {
        const fixture = await prepareNodeFixture('console-output.js');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.tempPath);

        // This test verifies that waitFor times out when condition is never met
        const response = await startSession({
          target,
          resumeAfterConfigure: true,
        });

        const sessionId = response.session.id;

        // Try to wait for an impossible condition with short timeout
        await expect(
          waitFor(
            async () => {
              try {
                const snapshot = manager.getSnapshot(sessionId);
                // This will never be true, causing timeout
                return snapshot.session.state.status ===
                  ('impossible-status' as 'terminated')
                  ? true
                  : null;
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.includes('not found')
                ) {
                  // Session was removed, return null to continue waiting
                  return null;
                }
                throw error;
              }
            },
            { timeoutMs: 500, intervalMs: 50 },
          ),
        ).rejects.toThrow(/timeout/i);
      });
    });
  },
  { timeout: 30000 },
);
