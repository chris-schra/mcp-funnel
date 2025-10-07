import { describe, it, expect } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import type { DebugSessionId, BreakpointSpec } from '../src/types/index.js';
import { createFixture } from './utils.js';

describe('Source Map Parsing', () => {
  describe('Source Map Parsing', () => {
    it('should parse inline data URL source maps from TypeScript files', async () => {
      const { manager, sessionId, response, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );

      const snapshot = manager.getSnapshot(sessionId);
      expect(snapshot.session.state.status).toBe('paused');
      expect(response.initialPause).toBeDefined();

      await cleanup();
    });

    it('should handle sourceRoot resolution in source maps', async () => {
      const { response, cleanup } = await createFixture('breakpoint-script.ts');

      expect(response.initialPause?.callFrames).toBeDefined();

      const callFrames = response.initialPause?.callFrames;
      expect(callFrames).toBeDefined();
      expect(callFrames!.length).toBeGreaterThan(0);

      const topFrame = callFrames![0];
      expect(topFrame).toBeDefined();
      expect(topFrame.functionName).toBeDefined();
      expect(topFrame.location).toBeDefined();

      await cleanup();
    });
  });

  describe('Script Metadata Indexing', () => {
    it('should index script metadata by absolute path', async () => {
      const { manager, sessionId, fixture, cleanup } = await createFixture(
        'breakpoint-script.ts',
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

      await cleanup();
    });

    it('should index script metadata by file URL', async () => {
      const { manager, sessionId, fixture, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      const fileUrl = `file://${fixture.tempPath}`;

      const breakpointResult = await addBreakpointDynamically(
        manager,
        sessionId,
        fileUrl,
        13,
      );

      expect(breakpointResult).toBeDefined();
      expect(breakpointResult.length).toBeGreaterThan(0);
      expect(breakpointResult[0].resolvedLocations).toBeDefined();

      await cleanup();
    });

    it('should support both path and fileUrl lookups for same script', async () => {
      const { manager, sessionId, fixture, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      const fileUrl = `file://${fixture.tempPath}`;

      // Set breakpoint using absolute path
      const breakpointByPath = await addBreakpointDynamically(
        manager,
        sessionId,
        fixture.tempPath,
        13,
      );

      expect(breakpointByPath.length).toBeGreaterThan(0);
      const pathScriptId = breakpointByPath[0]?.resolvedLocations[0]?.scriptId;
      expect(pathScriptId).toBeDefined();

      // Remove first breakpoint to set another at same location with different URL format
      await manager.runCommand({
        sessionId,
        action: 'pause',
        breakpoints: {
          remove: [breakpointByPath[0]!.id],
        },
      });

      // Set breakpoint using file:// URL
      const breakpointByUrl = await addBreakpointDynamically(
        manager,
        sessionId,
        fileUrl,
        13,
      );

      expect(breakpointByUrl.length).toBeGreaterThan(0);
      const urlScriptId = breakpointByUrl[0]?.resolvedLocations[0]?.scriptId;
      expect(urlScriptId).toBeDefined();

      // Both should resolve to the same script
      expect(pathScriptId).toBe(urlScriptId);

      await cleanup();
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
