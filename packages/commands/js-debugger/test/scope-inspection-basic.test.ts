import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import { prepareNodeFixture } from './utils/fixture-manager.js';
import { waitFor } from './utils/async-helpers.js';
import type {
  DebugSessionConfig,
  PauseDetails,
  ScopeQuery,
  ScopeQueryResult,
} from '../src/types/index.js';
import type { FixtureHandle } from './utils/fixture-manager.js';

describe('Scope Variable Inspection - Basic', () => {
  let manager: DebuggerSessionManager;
  let fixture: FixtureHandle;
  let sessionId: string;

  beforeEach(async () => {
    manager = new DebuggerSessionManager();
    fixture = await prepareNodeFixture('breakpoint-script.js');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  /**
   * Helper to start a debugging session and pause at the debugger statement.
   *
   * @returns Promise resolving to pause details containing call frames and scope information
   */
  async function startAndPause(): Promise<PauseDetails> {
    const config: DebugSessionConfig = {
      target: {
        type: 'node',
        entry: fixture.tempPath,
      },
      resumeAfterConfigure: true, // Let it run and hit the debugger statement
    };

    const response = await manager.startSession(config);
    sessionId = response.session.id;

    // Wait for the session to pause at the debugger statement
    const pauseDetails = await waitFor(
      async () => {
        const snapshot = manager.getSnapshot(sessionId);
        if (snapshot.session.status === 'paused') {
          // Get pause details by running a pause command (which returns current state if already paused)
          const result = await manager.runCommand({
            sessionId,
            action: 'pause',
          });
          return result.pause ?? null;
        }
        return null;
      },
      { timeoutMs: 15000, intervalMs: 100 },
    );

    return pauseDetails;
  }

  /**
   * Helper to get scope variables with given query parameters.
   *
   * @param callFrameId - The call frame identifier from pause details
   * @param scopeNumber - The zero-based index in the call frame's scope chain
   * @param options - Additional query options (depth, path, maxProperties)
   * @returns Promise resolving to scope query results with variables and metadata
   */
  async function getScopeVars(
    callFrameId: string,
    scopeNumber: number,
    options: Partial<
      Omit<ScopeQuery, 'sessionId' | 'callFrameId' | 'scopeNumber'>
    > = {},
  ): Promise<ScopeQueryResult> {
    return manager.getScopeVariables({
      sessionId,
      callFrameId,
      scopeNumber,
      ...options,
    });
  }

  describe('Basic Scope Inspection', () => {
    it('should retrieve variables from the local scope at depth 1', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      expect(topFrame).toBeDefined();
      expect(topFrame.scopeChain.length).toBeGreaterThan(0);

      const result = await getScopeVars(topFrame.callFrameId, 0, { depth: 1 });

      expect(result).toBeDefined();
      expect(result.variables).toBeDefined();
      expect(Array.isArray(result.variables)).toBe(true);
      expect(result.path).toEqual([]);
    }, 20000);

    it('should find expected variables in the local scope', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, { depth: 1 });

      // The breakpoint-script.js fixture defines these variables in triggerPause function:
      // - localState (object with doubled and nested properties)
      const varNames = result.variables.map((v) => v.name);
      expect(varNames).toContain('localState');
    });

    it('should navigate the scope chain at different indices', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      expect(topFrame.scopeChain.length).toBeGreaterThan(1);

      // Test accessing different scopes in the chain
      for (let i = 0; i < Math.min(topFrame.scopeChain.length, 3); i++) {
        const result = await getScopeVars(topFrame.callFrameId, i);
        expect(result).toBeDefined();
        expect(result.variables).toBeDefined();
      }
    });
  });

  describe('Call Frame Navigation', () => {
    it('should access variables from different call frames', async () => {
      const pauseDetails = await startAndPause();

      // Access the top frame
      const topFrame = pauseDetails.callFrames[0];
      const topResult = await getScopeVars(topFrame.callFrameId, 0);
      expect(topResult).toBeDefined();

      // If there are multiple frames, test accessing a deeper one
      if (pauseDetails.callFrames.length > 1) {
        const deeperFrame = pauseDetails.callFrames[1];
        const deeperResult = await getScopeVars(deeperFrame.callFrameId, 0);
        expect(deeperResult).toBeDefined();
      }
    });
  });

  describe('Depth Control', () => {
    it('should return shallow variables at depth 1', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, { depth: 1 });

      expect(result.variables).toBeDefined();
      // At depth 1, we should get top-level variables
      const localStateVar = result.variables.find(
        (v) => v.name === 'localState',
      );
      if (localStateVar) {
        // Children should not be deeply nested at depth 1 when path is not provided
        expect(localStateVar.children).toBeUndefined();
      }
    });

    it('should return deep nested variables at depth > 1 with path navigation', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, {
        path: ['localState'],
        depth: 2,
      });

      expect(result.variables).toBeDefined();
      // With a path and depth > 1, we should get nested properties
      if (result.variables.length > 0) {
        expect(result.variables[0]).toBeDefined();
      }
    });
  });

  describe('Path Navigation', () => {
    it('should navigate to nested object properties using path', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      // Navigate to the localState object
      const result = await getScopeVars(topFrame.callFrameId, 0, {
        path: ['localState'],
        depth: 1,
      });

      expect(result).toBeDefined();
      expect(result.path).toBeDefined();
      expect(result.variables).toBeDefined();

      // The localState object should have 'doubled' and 'nested' properties
      const varNames = result.variables.map((v) => v.name);
      expect(varNames).toContain('doubled');
      expect(varNames).toContain('nested');
    });

    it('should support string shorthand for property path segments', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, {
        path: ['localState', 'doubled'],
        depth: 1,
      });

      expect(result).toBeDefined();
      expect(result.path).toBeDefined();
    });

    it('should support object notation for property path segments', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, {
        path: [{ property: 'localState' }],
        depth: 1,
      });

      expect(result).toBeDefined();
      expect(result.variables).toBeDefined();
    });

    it('should navigate deep property paths', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      // Navigate multiple levels deep - localState.nested.input
      const result = await getScopeVars(topFrame.callFrameId, 0, {
        path: ['localState', 'nested'],
        depth: 1,
      });

      expect(result).toBeDefined();
      expect(result.path).toBeDefined();
      expect(result.variables).toBeDefined();

      // The nested object should have 'input' property
      const varNames = result.variables.map((v) => v.name);
      expect(varNames).toContain('input');
    });
  });
});
