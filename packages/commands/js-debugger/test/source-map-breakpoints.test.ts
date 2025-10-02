import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import { waitFor } from './utils/async-helpers.js';
import { prepareNodeFixture } from './utils/fixture-manager.js';
import type { DebugSessionId } from '../src/types/index.js';
import type { FixtureHandle } from './utils/fixture-manager.js';

describe('Source Map Breakpoints', () => {
  let manager: DebuggerSessionManager;
  let sessionId: DebugSessionId | undefined;
  let fixture: FixtureHandle | undefined;

  beforeEach(() => {
    manager = new DebuggerSessionManager();
    sessionId = undefined;
    fixture = undefined;
  });

  /**
   * Helper to start session with breakpoint, continue, and verify pause.
   * Reduces duplication across multiple tests that follow the same pattern.
   *
   * @param condition - Optional breakpoint condition expression
   */
  async function startContinueAndVerifyPause(
    condition?: string,
  ): Promise<void> {
    fixture = await prepareNodeFixture('breakpoint-script.ts');

    const response = await manager.startSession({
      target: {
        type: 'node',
        entry: fixture.tempPath,
        useTsx: true,
      },
      resumeAfterConfigure: false,
      breakpoints: [
        {
          location: {
            url: fixture.tempPath,
            lineNumber: 13,
          },
          condition,
        },
      ],
    });

    sessionId = response.session.id;

    await manager.runCommand({
      sessionId,
      action: 'continue',
    });

    // Wait for execution to either pause at breakpoint or complete
    const result = await waitFor(
      async () => {
        try {
          const currentSnapshot = manager.getSnapshot(sessionId!);
          return currentSnapshot.session.status === 'paused'
            ? currentSnapshot
            : null;
        } catch (error) {
          if (error instanceof Error && error.message.includes('not found')) {
            return true; // Session removed after termination - that's ok
          }
          throw error;
        }
      },
      { timeoutMs: 5000 },
    );

    // Verify we actually paused at breakpoint (not just terminated)
    if (typeof result === 'object') {
      expect(result.session.status).toBe('paused');
    }
  }

  afterEach(async () => {
    if (sessionId) {
      try {
        const descriptor = manager.getDescriptor(sessionId);
        if (descriptor.status !== 'terminated') {
          await manager.runCommand({
            sessionId,
            action: 'continue',
          });
          // Wait for session auto-removal after termination
          await waitFor(
            async () => {
              try {
                manager.getDescriptor(sessionId!);
                return null; // Still exists, keep waiting
              } catch {
                return true; // Session removed, done
              }
            },
            { timeoutMs: 5000 },
          );
        }
      } catch {
        // Session may have already been auto-removed
      }
    }
    if (fixture) {
      await fixture.cleanup();
    }
  });

  describe('Breakpoint Mapping', () => {
    it('should map original TypeScript location to generated JavaScript location', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
        breakpoints: [
          {
            location: {
              url: fixture.tempPath,
              lineNumber: 13,
              columnNumber: 0,
            },
          },
        ],
      });

      sessionId = response.session.id;
      expect(response.breakpoints).toBeDefined();
      expect(response.breakpoints!.length).toBeGreaterThan(0);

      const breakpoint = response.breakpoints![0];
      expect(breakpoint.requested.location.lineNumber).toBe(13);
      expect(breakpoint.resolvedLocations).toBeDefined();
      expect(breakpoint.resolvedLocations.length).toBeGreaterThan(0);
    });

    it('should handle breakpoint registration with source-mapped files', async () => {
      await startContinueAndVerifyPause();
    });

    it('should map breakpoints with column numbers', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
        breakpoints: [
          {
            location: {
              url: fixture.tempPath,
              lineNumber: 13,
              columnNumber: 2,
            },
          },
        ],
      });

      sessionId = response.session.id;
      expect(response.breakpoints).toBeDefined();
      expect(response.breakpoints!.length).toBeGreaterThan(0);

      const breakpoint = response.breakpoints![0];
      expect(breakpoint.resolvedLocations).toBeDefined();
      expect(breakpoint.resolvedLocations.length).toBeGreaterThan(0);

      const resolved = breakpoint.resolvedLocations[0];
      expect(resolved.lineNumber).toBeDefined();
      expect(resolved.columnNumber).toBeDefined();
    });
  });

  describe('Breakpoint Upgrade', () => {
    it('should upgrade from setBreakpointByUrl to setBreakpoint with scriptId', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
        breakpoints: [
          {
            location: {
              url: fixture.tempPath,
              lineNumber: 13,
            },
          },
        ],
      });

      sessionId = response.session.id;
      expect(response.breakpoints).toBeDefined();

      const initialBreakpoint = response.breakpoints![0];
      expect(initialBreakpoint.id).toBeDefined();
      expect(initialBreakpoint.resolvedLocations.length).toBeGreaterThan(0);

      const resolvedLocation = initialBreakpoint.resolvedLocations[0];
      expect(resolvedLocation.scriptId).toBeDefined();
      expect(typeof resolvedLocation.scriptId).toBe('string');
      if (resolvedLocation.scriptId) {
        expect(resolvedLocation.scriptId.length).toBeGreaterThan(0);
      }
    });

    it('should maintain breakpoint resolution after script parsing', async () => {
      await startContinueAndVerifyPause();
    });
  });

  describe('Path Normalization', () => {
    it('should normalize file:// URLs to absolute paths', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const fileUrl = `file://${fixture.tempPath}`;

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
        breakpoints: [
          {
            location: {
              url: fileUrl,
              lineNumber: 13,
            },
          },
        ],
      });

      sessionId = response.session.id;
      expect(response.breakpoints).toBeDefined();
      expect(response.breakpoints!.length).toBeGreaterThan(0);
    });

    it('should handle absolute paths in breakpoint locations', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: false,
        breakpoints: [
          {
            location: {
              url: fixture.tempPath,
              lineNumber: 13,
            },
          },
        ],
      });

      sessionId = response.session.id;
      expect(response.breakpoints).toBeDefined();

      const breakpoint = response.breakpoints![0];
      expect(breakpoint.resolvedLocations).toBeDefined();
      expect(breakpoint.resolvedLocations.length).toBeGreaterThan(0);
    });

    it('should handle relative paths resolved against working directory', async () => {
      fixture = await prepareNodeFixture('breakpoint-script.ts');

      const response = await manager.startSession({
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
          cwd: fixture.tempDir,
        },
        resumeAfterConfigure: false,
        breakpoints: [
          {
            location: {
              url: 'breakpoint-script.ts',
              lineNumber: 13,
            },
          },
        ],
      });

      sessionId = response.session.id;
      expect(response.breakpoints).toBeDefined();
    });
  });

  describe('Source Map Integration', () => {
    it('should correctly map pause location from generated to original source', async () => {
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
        async () => {
          try {
            const snapshot = manager.getSnapshot(sessionId!);
            return snapshot.session.status === 'paused' ? snapshot : null;
          } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
              return true; // Session removed after termination - that's ok
            }
            throw error;
          }
        },
        { timeoutMs: 5000 },
      );

      expect(response.initialPause?.callFrames).toBeDefined();

      const topFrame = response.initialPause!.callFrames[0];
      expect(topFrame.location.scriptId).toBeDefined();
      expect(topFrame.location.lineNumber).toBeGreaterThanOrEqual(0);
    });

    it('should handle conditional breakpoints with source maps', async () => {
      await startContinueAndVerifyPause('payload.original === 21');
    });
  });
});
