import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import type {
  DebugSessionConfig,
  DebugSessionStatus,
  NodeDebugTargetConfig,
  OutputEntry,
} from '../src/types/index.js';
import { waitFor } from './utils/async-helpers.js';
import type { FixtureHandle } from './utils/fixture-manager.js';
import { prepareNodeFixture } from './utils/fixture-manager.js';

describe('DebuggerSessionManager - Session Lifecycle', () => {
  let manager: DebuggerSessionManager;
  let fixture: FixtureHandle | null = null;

  beforeEach(() => {
    manager = new DebuggerSessionManager();
  });

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = null;
    }
  });

  const expectStatusIn = (
    actual: DebugSessionStatus,
    expected: DebugSessionStatus[],
  ): void => {
    expect(expected).toContain(actual);
  };

  const hasOutputContent = (entries: OutputEntry[], text: string): boolean =>
    entries.some((entry) => entry.entry.text.includes(text));

  const waitForTermination = async (sessionId: string): Promise<void> => {
    await waitFor(
      () => {
        try {
          const descriptor = manager.getDescriptor(sessionId);
          return descriptor.status === 'terminated' ? descriptor : null;
        } catch (error) {
          if (error instanceof Error && error.message.includes('not found')) {
            return true;
          }
          throw error;
        }
      },
      { timeoutMs: 3000 },
    );
  };

  const createNodeSession = async (
    fixtureName: string,
    config: Partial<DebugSessionConfig> = {},
  ) => {
    fixture = await prepareNodeFixture(fixtureName);
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

  describe('basic lifecycle', () => {
    it('should complete full lifecycle: start -> pause -> resume -> terminate', async () => {
      const response = await createNodeSession('auto-exit.js', {
        resumeAfterConfigure: false,
      });

      expect(response.session).toBeDefined();
      expect(response.initialPause).toBeDefined();
      expectStatusIn(response.session.status, ['awaiting-debugger', 'paused']);

      const sessionId = response.session.id;
      const descriptor = manager.getDescriptor(sessionId);
      expectStatusIn(descriptor.status, ['paused']);

      const continueResult = await manager.runCommand({
        sessionId,
        action: 'continue',
      });

      expectStatusIn(continueResult.session.status, ['running', 'paused']);

      // If still paused (hit a breakpoint), continue again
      if (continueResult.session.status === 'paused') {
        await manager.runCommand({ sessionId, action: 'continue' });
      }

      await waitForTermination(sessionId);
    });
  });

  describe('resumeAfterConfigure option', () => {
    it('should remain paused when resumeAfterConfigure is false', async () => {
      const response = await createNodeSession('auto-exit.js', {
        resumeAfterConfigure: false,
      });

      expect(response.initialPause).toBeDefined();
      expectStatusIn(response.session.status, ['paused']);

      const continueResult = await manager.runCommand({
        sessionId: response.session.id,
        action: 'continue',
      });

      // If still paused (hit a breakpoint), continue again
      if (continueResult.session.status === 'paused') {
        await manager.runCommand({
          sessionId: response.session.id,
          action: 'continue',
        });
      }

      await waitForTermination(response.session.id);
    });

    it('should auto-resume when resumeAfterConfigure is true', async () => {
      const response = await createNodeSession('auto-exit.js', {
        resumeAfterConfigure: true,
      });

      expect(response.initialPause).toBeUndefined();
      expectStatusIn(response.session.status, ['running', 'paused']);

      await waitForTermination(response.session.id);
    });
  });

  describe('pause and inspect state', () => {
    it('should pause execution and allow state inspection', async () => {
      const response = await createNodeSession('console-output.js', {
        resumeAfterConfigure: true,
      });
      const sessionId = response.session.id;

      await waitFor(
        () => {
          try {
            const descriptor = manager.getDescriptor(sessionId);
            return descriptor.status === 'running' ? descriptor : null;
          } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
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
      expectStatusIn(pauseResult.session.status, ['paused']);

      const snapshot = manager.getSnapshot(sessionId);
      expect(snapshot.session.status).toBe('paused');
      expect(snapshot.output).toBeDefined();

      await manager.runCommand({ sessionId, action: 'continue' });
      await waitForTermination(sessionId);
    });

    it('should inspect TypeScript breakpoints with output', async () => {
      const response = await createNodeSession('breakpoint-script.ts', {
        resumeAfterConfigure: true,
        target: { type: 'node', entry: '', useTsx: true },
      });
      const sessionId = response.session.id;

      const pauseDetails = await waitFor(
        async () => {
          try {
            const snapshot = manager.getSnapshot(sessionId);
            if (snapshot.session.status === 'paused') {
              const output = await manager.queryOutput({ sessionId });
              if (hasOutputContent(output.entries, 'Before TS breakpoint')) {
                return snapshot;
              }
            }
            return null;
          } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
              return true;
            }
            throw error;
          }
        },
        { timeoutMs: 5000 },
      );

      if (pauseDetails !== true) {
        expect(pauseDetails.session.status).toBe('paused');

        const output = await manager.queryOutput({ sessionId });
        expect(hasOutputContent(output.entries, 'Before TS breakpoint')).toBe(
          true,
        );

        await manager.runCommand({ sessionId, action: 'continue' });
      }

      await waitForTermination(sessionId);
    });
  });

  describe('process exit handling', () => {
    it('should handle clean process exit and session cleanup', async () => {
      const response = await createNodeSession('auto-exit.js', {
        resumeAfterConfigure: true,
      });
      const sessionId = response.session.id;

      await waitForTermination(sessionId);

      // Session may already be removed after termination
      expect(() => manager.getDescriptor(sessionId)).toThrow(
        `Debugger session ${sessionId} not found`,
      );
    });

    it('should capture console output before termination', async () => {
      const response = await createNodeSession('console-output.js', {
        resumeAfterConfigure: true,
      });
      const sessionId = response.session.id;

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
      expect(hasOutputContent(output.entries, 'Test log message')).toBe(true);

      await waitFor(
        () => {
          try {
            const descriptor = manager.getDescriptor(sessionId);
            return descriptor.status === 'terminated' ? descriptor : null;
          } catch {
            return true;
          }
        },
        { timeoutMs: 3000 },
      );
    });
  });

  describe('status transitions', () => {
    it('should maintain valid status throughout lifecycle', async () => {
      const response = await createNodeSession('auto-exit.js', {
        resumeAfterConfigure: false,
      });
      const sessionId = response.session.id;

      const statusHistory: DebugSessionStatus[] = [response.session.status];

      const pausedDescriptor = manager.getDescriptor(sessionId);
      statusHistory.push(pausedDescriptor.status);
      expect(pausedDescriptor.status).toBe('paused');

      const continueResult = await manager.runCommand({
        sessionId,
        action: 'continue',
      });
      statusHistory.push(continueResult.session.status);

      // If still paused (hit a breakpoint), continue again
      if (continueResult.session.status === 'paused') {
        const secondContinue = await manager.runCommand({
          sessionId,
          action: 'continue',
        });
        statusHistory.push(secondContinue.session.status);
      }

      await waitForTermination(sessionId);

      // Session may have been removed after termination, but we know it reached terminated state
      statusHistory.push('terminated');

      const validStatuses: DebugSessionStatus[] = [
        'starting',
        'awaiting-debugger',
        'paused',
        'running',
        'terminated',
      ];
      statusHistory.forEach((status) => {
        expect(validStatuses).toContain(status);
      });
    });
  });
});
