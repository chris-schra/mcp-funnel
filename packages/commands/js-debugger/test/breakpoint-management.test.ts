import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import { waitFor } from './utils/async-helpers.js';
import { prepareNodeFixture } from './utils/fixture-manager.js';
import type {
  DebugSessionConfig,
  DebugSessionId,
  BreakpointSpec,
  BreakpointSummary,
  DebuggerCommandResult,
} from '../src/types/index.js';
import type { FixtureHandle } from './utils/fixture-manager.js';

describe('Breakpoint Management', () => {
  let manager: DebuggerSessionManager;
  let fixture: FixtureHandle;
  let sessionId: DebugSessionId;

  beforeEach(async () => {
    manager = new DebuggerSessionManager();
    fixture = await prepareNodeFixture('breakpoint-script.ts');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  const startSession = async (
    config: Partial<DebugSessionConfig> = {},
  ): Promise<DebugSessionId> => {
    const response = await manager.startSession({
      target: {
        type: 'node',
        entry: fixture.tempPath,
        useTsx: true,
      },
      resumeAfterConfigure: false,
      ...config,
    });
    return response.session.id;
  };

  const waitForPause = async (sid: DebugSessionId): Promise<void> => {
    await waitFor(() => {
      const snapshot = manager.getSnapshot(sid);
      return snapshot.session.status === 'paused' ? true : null;
    });
  };

  const waitForTermination = async (sid: DebugSessionId): Promise<void> => {
    await waitFor(
      async () => {
        const snapshot = manager.getSnapshot(sid);
        return snapshot.session.status === 'terminated' ? true : null;
      },
      { timeoutMs: 3000 },
    );
  };

  const getBreakpointSummary = (
    result: DebuggerCommandResult,
  ): BreakpointSummary[] => result.setBreakpoints ?? [];

  describe('Setting breakpoints by URL', () => {
    it('should set a breakpoint using URL', async () => {
      sessionId = await startSession();

      const breakpoint: BreakpointSpec = {
        location: { url: fixture.tempPath, lineNumber: 13 },
      };

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: { set: [breakpoint] },
      });

      const summaries = getBreakpointSummary(result);
      expect(summaries).toHaveLength(1);
      expect(summaries[0].requested).toEqual(breakpoint);
      expect(summaries[0].resolvedLocations).toHaveLength(1);
    });

    it('should set multiple breakpoints on same file', async () => {
      sessionId = await startSession();

      const breakpoints: BreakpointSpec[] = [
        { location: { url: fixture.tempPath, lineNumber: 10 } },
        { location: { url: fixture.tempPath, lineNumber: 13 } },
        { location: { url: fixture.tempPath, lineNumber: 15 } },
      ];

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: { set: breakpoints },
      });

      const summaries = getBreakpointSummary(result);
      expect(summaries).toHaveLength(3);
      const ids = summaries.map((s) => s.id);
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe('Conditional breakpoints', () => {
    it('should set a conditional breakpoint', async () => {
      sessionId = await startSession();

      const breakpoint: BreakpointSpec = {
        location: { url: fixture.tempPath, lineNumber: 13 },
        condition: 'payload.original === 21',
      };

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: { set: [breakpoint] },
      });

      const summaries = getBreakpointSummary(result);
      expect(summaries[0].requested.condition).toBe('payload.original === 21');
    });

    it('should not hit breakpoint when condition is false', async () => {
      sessionId = await startSession();

      const breakpoint: BreakpointSpec = {
        location: { url: fixture.tempPath, lineNumber: 13 },
        condition: 'payload.original === 999',
      };

      await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: { set: [breakpoint] },
      });

      await waitForTermination(sessionId);
      expect(manager.getSnapshot(sessionId).session.status).toBe('terminated');
    });

    it('should hit breakpoint when condition is true', async () => {
      sessionId = await startSession();

      const breakpoint: BreakpointSpec = {
        location: { url: fixture.tempPath, lineNumber: 13 },
        condition: 'payload.original === 21',
      };

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: { set: [breakpoint] },
      });

      await waitForPause(sessionId);
      expect(manager.getSnapshot(sessionId).session.status).toBe('paused');
      expect(result.pause?.reason).toBe('breakpoint');
    });
  });

  describe('Removing breakpoints', () => {
    it('should remove breakpoints and not hit them', async () => {
      sessionId = await startSession();

      const setResult = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [{ location: { url: fixture.tempPath, lineNumber: 13 } }],
        },
      });

      const breakpointId = getBreakpointSummary(setResult)[0].id;

      const removeResult = await manager.runCommand({
        sessionId,
        action: 'pause',
        breakpoints: { remove: [breakpointId] },
      });

      expect(removeResult.removedBreakpoints).toEqual([breakpointId]);

      await manager.runCommand({ sessionId, action: 'continue' });
      await waitForTermination(sessionId);
      expect(manager.getSnapshot(sessionId).session.status).toBe('terminated');
    });

    it('should remove multiple breakpoints', async () => {
      sessionId = await startSession();

      const setResult = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [
            { location: { url: fixture.tempPath, lineNumber: 10 } },
            { location: { url: fixture.tempPath, lineNumber: 13 } },
          ],
        },
      });

      const ids = getBreakpointSummary(setResult).map((s) => s.id);

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: { remove: ids },
      });

      expect(result.removedBreakpoints).toEqual(expect.arrayContaining(ids));
    });
  });

  describe('Breakpoint hit events', () => {
    it('should report pause details and call stack', async () => {
      sessionId = await startSession();

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [{ location: { url: fixture.tempPath, lineNumber: 13 } }],
        },
      });

      await waitForPause(sessionId);

      expect(result.pause).toBeDefined();
      expect(result.pause?.reason).toBe('breakpoint');
      expect(result.pause?.callFrames.length).toBeGreaterThan(0);

      const topFrame = result.pause?.callFrames[0];
      expect(topFrame?.location.lineNumber).toBeGreaterThanOrEqual(0);
    });
  });

  describe('continueToLocation', () => {
    it('should continue to specified location', async () => {
      sessionId = await startSession();

      await manager.runCommand({ sessionId, action: 'pause' });
      await waitForPause(sessionId);

      const result = await manager.runCommand({
        sessionId,
        action: 'continueToLocation',
        location: { url: fixture.tempPath, lineNumber: 15 },
      });

      await waitForPause(sessionId);
      expect(result.pause?.callFrames[0].location.lineNumber).toBe(15);
    });

    it('should resume if location unreachable', async () => {
      sessionId = await startSession();

      await manager.runCommand({ sessionId, action: 'pause' });
      await waitForPause(sessionId);

      await manager.runCommand({
        sessionId,
        action: 'continueToLocation',
        location: { url: fixture.tempPath, lineNumber: 999 },
      });

      await waitForTermination(sessionId);
      expect(manager.getSnapshot(sessionId).session.status).toBe('terminated');
    });
  });

  describe('Breakpoint resolution', () => {
    it('should resolve and distinguish requested vs actual locations', async () => {
      sessionId = await startSession();

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [{ location: { url: fixture.tempPath, lineNumber: 13 } }],
        },
      });

      const summary = getBreakpointSummary(result)[0];
      expect(summary.resolvedLocations).toBeDefined();
      expect(summary.resolvedLocations.length).toBeGreaterThan(0);
      expect(summary.requested.location.lineNumber).toBe(13);
      expect(summary.resolvedLocations[0]).toBeDefined();
    });

    it('should handle breakpoint in comment gracefully', async () => {
      sessionId = await startSession();

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [{ location: { url: fixture.tempPath, lineNumber: 1 } }],
        },
      });

      expect(
        getBreakpointSummary(result)[0].resolvedLocations[0].lineNumber,
      ).not.toBe(1);
    });
  });

  describe('Breakpoint and stepping', () => {
    it('should support stepping from breakpoint', async () => {
      sessionId = await startSession();

      await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [{ location: { url: fixture.tempPath, lineNumber: 13 } }],
        },
      });

      await waitForPause(sessionId);

      const stepResult = await manager.runCommand({
        sessionId,
        action: 'stepOver',
      });

      await waitForPause(sessionId);
      expect(
        stepResult.pause?.callFrames[0].location.lineNumber,
      ).toBeGreaterThan(13);
    });

    it('should continue between multiple breakpoints', async () => {
      sessionId = await startSession();

      await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [
            { location: { url: fixture.tempPath, lineNumber: 13 } },
            { location: { url: fixture.tempPath, lineNumber: 15 } },
          ],
        },
      });

      await waitForPause(sessionId);
      expect(manager.getSnapshot(sessionId).session.status).toBe('paused');

      await manager.runCommand({ sessionId, action: 'continue' });
      await waitForPause(sessionId);
      expect(manager.getSnapshot(sessionId).session.status).toBe('paused');
    });
  });
  describe('Edge cases', () => {
    it('should handle setting breakpoint on non-existent file', async () => {
      sessionId = await startSession();

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [{ location: { url: '/non/existent/file.ts', lineNumber: 10 } }],
        },
      });

      expect(getBreakpointSummary(result)[0].resolvedLocations).toHaveLength(0);
    });

    it('should handle setting and removing in same command', async () => {
      sessionId = await startSession();

      const setResult = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [{ location: { url: fixture.tempPath, lineNumber: 10 } }],
        },
      });

      const breakpointId = getBreakpointSummary(setResult)[0].id;

      const result = await manager.runCommand({
        sessionId,
        action: 'continue',
        breakpoints: {
          set: [{ location: { url: fixture.tempPath, lineNumber: 15 } }],
          remove: [breakpointId],
        },
      });

      expect(result.removedBreakpoints).toEqual([breakpointId]);
      expect(getBreakpointSummary(result)).toHaveLength(1);
      expect(
        getBreakpointSummary(result)[0].requested.location.lineNumber,
      ).toBe(15);
    });
  });
});
