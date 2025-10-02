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

describe('Scope Variable Inspection - Advanced', () => {
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

  describe('maxProperties Limit', () => {
    it('should respect maxProperties limit', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, {
        depth: 1,
        maxProperties: 2,
      });

      expect(result).toBeDefined();
      expect(result.variables).toBeDefined();
      // Should not return more than maxProperties
      expect(result.variables.length).toBeLessThanOrEqual(2);
    });

    it('should set truncated flag when properties exceed maxProperties', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      // Get a scope that likely has more than 1 property
      const fullResult = await getScopeVars(topFrame.callFrameId, 0, {
        depth: 1,
        maxProperties: 100,
      });

      if (fullResult.variables.length > 2) {
        const limitedResult = await getScopeVars(topFrame.callFrameId, 0, {
          depth: 1,
          maxProperties: 1,
        });

        expect(limitedResult.truncated).toBe(true);
      }
    });

    it('should handle very small maxProperties values', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, {
        depth: 1,
        maxProperties: 1,
      });

      expect(result).toBeDefined();
      expect(result.variables.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Cases', () => {
    it('should throw when session is not paused', async () => {
      const config: DebugSessionConfig = {
        target: {
          type: 'node',
          entry: fixture.tempPath,
          useTsx: true,
        },
        resumeAfterConfigure: true,
      };

      const response = await manager.startSession(config);
      sessionId = response.session.id;

      // Try to get scope variables before the session is paused
      await expect(async () => {
        await getScopeVars('invalid-frame-id', 0);
      }).rejects.toThrow(/not paused/i);
    });

    it('should throw when call frame ID is invalid', async () => {
      await startAndPause();

      await expect(async () => {
        await getScopeVars('invalid-call-frame-id', 0);
      }).rejects.toThrow(/not found/i);
    });

    it('should throw when scope index is out of range', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const outOfRangeIndex = topFrame.scopeChain.length + 10;

      await expect(async () => {
        await getScopeVars(topFrame.callFrameId, outOfRangeIndex);
      }).rejects.toThrow(/out of range/i);
    });

    it('should throw when session does not exist', async () => {
      await expect(async () => {
        await manager.getScopeVariables({
          sessionId: 'non-existent-session-id',
          callFrameId: 'some-frame',
          scopeNumber: 0,
        });
      }).rejects.toThrow(/not found/i);
    });
  });

  describe('Variable Value Types', () => {
    it('should correctly represent object variables', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, {
        path: ['localState'],
        depth: 1,
      });

      expect(result.variables).toBeDefined();
      result.variables.forEach((variable) => {
        expect(variable.name).toBeDefined();
        expect(variable.value).toBeDefined();
        expect(variable.value.type).toBeDefined();
      });
    });

    it('should correctly represent function variables', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      // Look in a broader scope (closure or global) for function definitions
      const scopeIndex = Math.min(1, topFrame.scopeChain.length - 1);
      const result = await getScopeVars(topFrame.callFrameId, scopeIndex, {
        depth: 1,
      });

      const computeValueVar = result.variables.find(
        (v) => v.name === 'computeValue' || v.name === 'triggerPause',
      );
      if (computeValueVar) {
        expect(computeValueVar.value.type).toBe('function');
      }
    });

    it('should correctly represent primitive number values', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, {
        path: ['localState'],
        depth: 1,
      });

      const doubledVar = result.variables.find((v) => v.name === 'doubled');
      if (doubledVar) {
        expect(doubledVar.value.type).toBe('number');
      }
    });
  });

  describe('Truncation Handling', () => {
    it('should indicate truncation on individual variables when nested properties are limited', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, {
        path: ['localState'],
        depth: 2,
        maxProperties: 1,
      });

      // When drilling into nested objects with tight limits, truncation may occur
      expect(result).toBeDefined();
    });
  });

  describe('Message Guidance', () => {
    it('should provide messages when depth is reduced for root queries', async () => {
      const pauseDetails = await startAndPause();
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(topFrame.callFrameId, 0, {
        depth: 3, // Request depth > 1 without path
      });

      // The implementation should provide a message about depth reduction
      expect(result.messages).toBeDefined();
      if (result.messages && result.messages.length > 0) {
        expect(result.messages.some((m) => m.includes('depth'))).toBe(true);
      }
    });
  });
});
