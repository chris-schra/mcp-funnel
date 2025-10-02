import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import { waitFor } from './utils/async-helpers.js';
import { prepareNodeFixture } from './utils/fixture-manager.js';
import type { DebugSessionId, BreakpointSpec } from '../src/types/index.js';
import type { FixtureHandle } from './utils/fixture-manager.js';

describe('Source Map Parsing', () => {
  let manager: DebuggerSessionManager;
  let sessionId: DebugSessionId | undefined;
  let fixture: FixtureHandle | undefined;

  beforeEach(() => {
    manager = new DebuggerSessionManager();
    sessionId = undefined;
    fixture = undefined;
  });

  afterEach(async () => {
    if (sessionId) {
      try {
        const descriptor = manager.getDescriptor(sessionId);
        if (descriptor.status !== 'terminated') {
          await manager.runCommand({
            sessionId,
            action: 'continue',
          });
        }
      } catch {
        // Session may have already terminated
      }
    }
    if (fixture) {
      await fixture.cleanup();
    }
  });

  describe('Source Map Parsing', () => {
    it('should parse inline data URL source maps from TypeScript files', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
      });

      sessionId = response.session.id;

      await waitFor(
        () => {
          const snapshot = manager.getSnapshot(sessionId!);
          return snapshot.session.status === 'paused' ? snapshot : null;
        },
        { timeoutMs: 5000 },
      );

      const snapshot = manager.getSnapshot(sessionId);
      expect(snapshot.session.status).toBe('paused');
      expect(response.initialPause).toBeDefined();
    });

    it('should handle sourceRoot resolution in source maps', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
      });

      sessionId = response.session.id;

      await waitFor(
        () => {
          const snapshot = manager.getSnapshot(sessionId!);
          return snapshot.session.status === 'paused' ? snapshot : null;
        },
        { timeoutMs: 5000 },
      );

      expect(response.initialPause?.callFrames).toBeDefined();

      const callFrames = response.initialPause?.callFrames;
      expect(callFrames).toBeDefined();
      expect(callFrames!.length).toBeGreaterThan(0);

      const topFrame = callFrames![0];
      expect(topFrame).toBeDefined();
      expect(topFrame.functionName).toBeDefined();
      expect(topFrame.location).toBeDefined();
    });
  });

  describe('Script Metadata Indexing', () => {
    it('should index script metadata by absolute path', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
      });

      sessionId = response.session.id;

      await waitFor(
        () => {
          const snapshot = manager.getSnapshot(sessionId!);
          return snapshot.session.status === 'paused' ? snapshot : null;
        },
        { timeoutMs: 5000 },
      );

      const breakpointResult = await addBreakpointDynamically(
        manager,
        sessionId,
        fixture.tempPath,
        13,
      );

      expect(breakpointResult).toBeDefined();
      expect(breakpointResult.length).toBeGreaterThan(0);
      expect(breakpointResult[0].resolvedLocations).toBeDefined();
    });

    it('should index script metadata by file URL', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const fileUrl = `file://${fixture.tempPath}`;

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
      });

      sessionId = response.session.id;

      await waitFor(
        () => {
          const snapshot = manager.getSnapshot(sessionId!);
          return snapshot.session.status === 'paused' ? snapshot : null;
        },
        { timeoutMs: 5000 },
      );

      const breakpointResult = await addBreakpointDynamically(
        manager,
        sessionId,
        fileUrl,
        13,
      );

      expect(breakpointResult).toBeDefined();
      expect(breakpointResult.length).toBeGreaterThan(0);
      expect(breakpointResult[0].resolvedLocations).toBeDefined();
    });

    it('should support both path and fileUrl lookups for same script', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const fileUrl = `file://${fixture.tempPath}`;

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
      });

      sessionId = response.session.id;

      await waitFor(
        () => {
          const snapshot = manager.getSnapshot(sessionId!);
          return snapshot.session.status === 'paused' ? snapshot : null;
        },
        { timeoutMs: 5000 },
      );

      const breakpointByPath = await addBreakpointDynamically(
        manager,
        sessionId,
        fixture.tempPath,
        13,
      );

      const breakpointByUrl = await addBreakpointDynamically(
        manager,
        sessionId,
        fileUrl,
        13,
      );

      expect(breakpointByPath[0].resolvedLocations[0].scriptId).toBe(
        breakpointByUrl[0].resolvedLocations[0].scriptId,
      );
    });
  });
});

/**
 * Helper function to add a breakpoint dynamically during a paused session.
 * Follows DRY principle by abstracting repeated breakpoint addition logic.
 * Uses the breakpoints mutation API to set breakpoints atomically with a command.
 * @param manager - The debugger session manager instance
 * @param sessionId - The debug session identifier
 * @param url - The script URL or file path for the breakpoint
 * @param lineNumber - The zero-based line number for the breakpoint
 * @returns Promise resolving to array of set breakpoints
 */
async function addBreakpointDynamically(
  manager: DebuggerSessionManager,
  sessionId: DebugSessionId,
  url: string,
  lineNumber: number,
) {
  const spec: BreakpointSpec = {
    location: {
      url,
      lineNumber,
    },
  };

  const result = await manager.runCommand({
    sessionId,
    action: 'pause',
    breakpoints: {
      set: [spec],
    },
  });

  return result.setBreakpoints ?? [];
}
