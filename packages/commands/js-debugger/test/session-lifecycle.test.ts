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
        const descriptor = manager.getDescriptor(sessionId);
        return descriptor.status === 'terminated' ? descriptor : null;
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
      entry: fixture.tempPath,
      ...config.target,
    };
    return manager.startSession({ target, ...config });
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

      expect(continueResult.resumed).toBe(true);
      expectStatusIn(continueResult.session.status, ['running']);

      await waitForTermination(sessionId);

      const finalDescriptor = manager.getDescriptor(sessionId);
      expect(finalDescriptor.status).toBe('terminated');
    });
  });

  describe('resumeAfterConfigure option', () => {
    it('should remain paused when resumeAfterConfigure is false', async () => {
      const response = await createNodeSession('auto-exit.js', {
        resumeAfterConfigure: false,
      });

      expect(response.initialPause).toBeDefined();
      expectStatusIn(response.session.status, ['paused']);

      await manager.runCommand({
        sessionId: response.session.id,
        action: 'continue',
      });

      await waitForTermination(response.session.id);
    });

    it('should auto-resume when resumeAfterConfigure is true', async () => {
      const response = await createNodeSession('auto-exit.js', {
        resumeAfterConfigure: true,
      });

      expect(response.initialPause).toBeUndefined();
      expectStatusIn(response.session.status, ['running', 'paused']);

      await waitForTermination(response.session.id);

      const finalDescriptor = manager.getDescriptor(response.session.id);
      expect(finalDescriptor.status).toBe('terminated');
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
          const descriptor = manager.getDescriptor(sessionId);
          return descriptor.status === 'running' ? descriptor : null;
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
          const snapshot = manager.getSnapshot(sessionId);
          if (snapshot.session.status === 'paused') {
            const output = await manager.queryOutput({ sessionId });
            if (hasOutputContent(output.entries, 'Before TS breakpoint')) {
              return snapshot;
            }
          }
          return null;
        },
        { timeoutMs: 5000 },
      );

      expect(pauseDetails.session.status).toBe('paused');

      const output = await manager.queryOutput({ sessionId });
      expect(hasOutputContent(output.entries, 'Before TS breakpoint')).toBe(
        true,
      );

      await manager.runCommand({ sessionId, action: 'continue' });
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

      const finalDescriptor = manager.getDescriptor(sessionId);
      expect(finalDescriptor.status).toBe('terminated');

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

      await waitForTermination(sessionId);

      const terminatedDescriptor = manager.getDescriptor(sessionId);
      statusHistory.push(terminatedDescriptor.status);
      expect(terminatedDescriptor.status).toBe('terminated');

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
