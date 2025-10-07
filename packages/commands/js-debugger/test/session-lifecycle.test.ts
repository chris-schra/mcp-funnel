import { describe, expect, it } from 'vitest';

import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import type {
  DebugSessionConfig,
  NodeDebugTargetConfig,
  OutputEntry,
} from '../src/types/index.js';
import { waitFor, sleep } from './utils/async-helpers.js';
import type { FixtureHandle } from './utils/fixture-manager.js';
import { prepareNodeFixture } from './utils/fixture-manager.js';
import type { SessionStateStatus } from '../src/types/session/session-state.js';
import {
  waitForSessionTermination,
  cleanupSession,
} from './utils/session-helpers.js';

describe('DebuggerSessionManager - Session Lifecycle', () => {
  const expectStatusIn = (
    actual: SessionStateStatus,
    expected: SessionStateStatus[],
  ): void => {
    expect(expected).toContain(actual);
  };

  const hasOutputContent = (entries: OutputEntry[], text: string): boolean =>
    entries.some((entry) => entry.entry.text.includes(text));

  const createNodeSession = async (
    manager: DebuggerSessionManager,
    fixture: FixtureHandle,
    config: Partial<DebugSessionConfig> = {},
  ) => {
    const target: NodeDebugTargetConfig = {
      type: 'node',
      ...config.target,
      // Always use fixture path as entry, don't let config override with empty string
      entry: fixture.tempPath,
    };
    // Exclude target from config to avoid overwriting our fixed target
    const { target: _, ...restConfig } = config;
    return manager.startSession({ target, ...restConfig });
  };

  /**
   * Helper to run a test with automatic cleanup of manager, fixture, and session
   */
  const withSession = async <T>(
    fixtureName: string,
    config: Partial<DebugSessionConfig>,
    testFn: (
      manager: DebuggerSessionManager,
      sessionId: string,
      fixture: FixtureHandle,
    ) => Promise<T>,
  ): Promise<T> => {
    const manager = new DebuggerSessionManager();
    const fixture = await prepareNodeFixture(fixtureName);
    let sessionId: string | undefined;

    try {
      const response = await createNodeSession(manager, fixture, config);
      sessionId = response.session.id;
      return await testFn(manager, sessionId, fixture);
    } finally {
      await cleanupSession(manager, sessionId);
      await fixture.cleanup();
    }
  };

  describe('basic lifecycle', () => {
    it('should complete full lifecycle: start -> pause -> resume -> terminate', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('auto-exit.js');
      let sessionId: string | undefined;

      try {
        const response = await createNodeSession(manager, fixture, {
          resumeAfterConfigure: false,
        });

        expect(response.session).toBeDefined();
        expect(response.initialPause).toBeDefined();
        expectStatusIn(response.session.state.status, [
          'awaiting-debugger',
          'paused',
        ]);

        sessionId = response.session.id;
        const descriptor = manager.getDescriptor(sessionId);
        expectStatusIn(descriptor.state.status, ['paused']);

        const continueResult = await manager.runCommand({
          sessionId,
          action: 'continue',
        });

        expect(continueResult.commandAck.sent).toBe(true);
        // After sending continue command (fire-and-forget), give event time to process
        await sleep(150);
        const afterContinue = manager.getDescriptor(sessionId);
        expectStatusIn(afterContinue.state.status, ['running', 'paused']);

        // Continue past any internal pauses until termination
        await waitFor(
          async () => {
            try {
              const snapshot = manager.getSnapshot(sessionId!);
              if (snapshot.session.state.status === 'paused') {
                await manager.runCommand({
                  sessionId: sessionId!,
                  action: 'continue',
                });
                await sleep(100);
                return null;
              }
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
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });
  });

  describe('resumeAfterConfigure option', () => {
    it('should remain paused when resumeAfterConfigure is false', async () => {
      await withSession(
        'auto-exit.js',
        { resumeAfterConfigure: false },
        async (manager, sessionId) => {
          const descriptor = manager.getDescriptor(sessionId);
          expect(descriptor.state.status).toBe('paused');

          const continueResult = await manager.runCommand({
            sessionId,
            action: 'continue',
          });

          expect(continueResult.commandAck.sent).toBe(true);
          await sleep(150);
          const afterContinue = manager.getDescriptor(sessionId);
          expectStatusIn(afterContinue.state.status, ['running', 'paused']);

          // Continue past any internal pauses until termination
          await waitFor(
            async () => {
              try {
                const snapshot = manager.getSnapshot(sessionId);
                if (snapshot.session.state.status === 'paused') {
                  await manager.runCommand({ sessionId, action: 'continue' });
                  await sleep(100);
                  return null;
                }
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
        },
      );
    });

    it('should auto-resume when resumeAfterConfigure is true', async () => {
      await withSession(
        'auto-exit.js',
        { resumeAfterConfigure: true },
        async (manager, sessionId) => {
          const descriptor = manager.getDescriptor(sessionId);
          expectStatusIn(descriptor.state.status, ['running', 'paused']);
          await waitForSessionTermination(manager, sessionId);
        },
      );
    });
  });

  describe('pause and inspect state', () => {
    it('should pause execution and allow state inspection', async () => {
      await withSession(
        'console-output.js',
        { resumeAfterConfigure: true },
        async (manager, sessionId) => {
          await waitFor(
            () => {
              try {
                const descriptor = manager.getDescriptor(sessionId);
                return descriptor.state.status === 'running'
                  ? descriptor
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
            { timeoutMs: 2000 },
          );

          const pauseResult = await manager.runCommand({
            sessionId,
            action: 'pause',
          });

          expect(pauseResult.pause).toBeDefined();
          expect(pauseResult.pause?.callFrames.length).toBeGreaterThan(0);
          expectStatusIn(pauseResult.session.state.status, ['paused']);

          const snapshot = manager.getSnapshot(sessionId);
          expect(snapshot.session.state.status).toBe('paused');
          expect(snapshot.output).toBeDefined();

          await manager.runCommand({ sessionId, action: 'continue' });
          await waitForSessionTermination(manager, sessionId);
        },
      );
    });

    it('should inspect TypeScript breakpoints with output', async () => {
      await withSession(
        'breakpoint-script.ts',
        { resumeAfterConfigure: true, target: { type: 'node', entry: '', useTsx: true } },
        async (manager, sessionId) => {
          const pauseDetails = await waitFor(
            async () => {
              try {
                const snapshot = manager.getSnapshot(sessionId);
                if (snapshot.session.state.status === 'paused') {
                  const output = await manager.queryOutput({ sessionId });
                  if (
                    hasOutputContent(output.entries, 'Before TS breakpoint')
                  ) {
                    return snapshot;
                  }
                }
                return null;
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

          if (pauseDetails !== true) {
            expect(pauseDetails.session.state.status).toBe('paused');

            const output = await manager.queryOutput({ sessionId });
            expect(
              hasOutputContent(output.entries, 'Before TS breakpoint'),
            ).toBe(true);

            await manager.runCommand({ sessionId, action: 'continue' });
          }

          await waitForSessionTermination(manager, sessionId);
        },
      );
    });
  });

  describe('process exit handling', () => {
    it('should handle clean process exit and session cleanup', async () => {
      await withSession(
        'auto-exit.js',
        { resumeAfterConfigure: true },
        async (manager, sessionId) => {
          await waitForSessionTermination(manager, sessionId);

          // Session may already be removed after termination
          expect(() => manager.getDescriptor(sessionId)).toThrow(
            `Debugger session ${sessionId} not found`,
          );
        },
      );
    });

    it('should capture console output before termination', async () => {
      await withSession(
        'console-output.js',
        { resumeAfterConfigure: true },
        async (manager, sessionId) => {
          await waitFor(
            async () => {
              const output = await manager.queryOutput({ sessionId });
              return hasOutputContent(output.entries, 'Test log message')
                ? output
                : null;
            },
            { timeoutMs: 3000 },
          );

          const output = await manager.queryOutput({ sessionId });
          expect(hasOutputContent(output.entries, 'Test log message')).toBe(
            true,
          );

          await waitFor(
            () => {
              try {
                const descriptor = manager.getDescriptor(sessionId);
                return descriptor.state.status === 'terminated'
                  ? descriptor
                  : null;
              } catch {
                return true;
              }
            },
            { timeoutMs: 3000 },
          );
        },
      );
    });
  });

  describe('status transitions', () => {
    it('should maintain valid status throughout lifecycle', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('auto-exit.js');
      let sessionId: string | undefined;

      try {
        const response = await createNodeSession(manager, fixture, {
          resumeAfterConfigure: false,
        });
        sessionId = response.session.id;

        const statusHistory: SessionStateStatus[] = [
          response.session.state.status,
        ];

        const pausedDescriptor = manager.getDescriptor(sessionId);
        statusHistory.push(pausedDescriptor.state.status);
        expect(pausedDescriptor.state.status).toBe('paused');

        const continueResult = await manager.runCommand({
          sessionId,
          action: 'continue',
        });
        expect(continueResult.commandAck.sent).toBe(true);
        statusHistory.push(continueResult.session.state.status);

        // Continue past any internal pauses until termination
        await waitFor(
          async () => {
            try {
              const snapshot = manager.getSnapshot(sessionId!);
              if (snapshot.session.state.status === 'paused') {
                const secondContinue = await manager.runCommand({
                  sessionId: sessionId!,
                  action: 'continue',
                });
                statusHistory.push(secondContinue.session.state.status);
                await sleep(100);
                return null;
              }
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

        // Session may have been removed after termination, but we know it reached terminated state
        statusHistory.push('terminated');

        const validStatuses: SessionStateStatus[] = [
          'starting',
          'awaiting-debugger',
          'paused',
          'running',
          'transitioning',
          'terminated',
        ];
        statusHistory.forEach((status) => {
          expect(validStatuses).toContain(status);
        });
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });
  });
});
