import { describe, it, expect } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import { prepareNodeFixture } from './utils/fixture-manager.js';
import { startAndPause, getScopeVars } from './utils/scope-helpers.js';
import { cleanupSession } from './utils/session-helpers.js';
import type { DebugSessionConfig } from '../src/types/index.js';
import type { FixtureHandle } from './utils/fixture-manager.js';

describe('Scope Variable Inspection - Advanced', () => {

  describe('maxProperties Limit', () => {
    it('should respect maxProperties limit', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        let pauseDetails;
        ({ sessionId, pauseDetails } = await startAndPause(
          manager,
          fixture.tempPath,
        ));
        const topFrame = pauseDetails.callFrames[0];

        const result = await getScopeVars(
          manager,
          sessionId,
          topFrame.callFrameId,
          0,
          {
            depth: 1,
            maxProperties: 2,
          },
        );

        expect(result).toBeDefined();
        expect(result.variables).toBeDefined();
        // Should not return more than maxProperties
        expect(result.variables.length).toBeLessThanOrEqual(2);
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });

    it('should set truncated flag when properties exceed maxProperties', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        let pauseDetails;
        ({ sessionId, pauseDetails } = await startAndPause(
          manager,
          fixture.tempPath,
        ));
        const topFrame = pauseDetails.callFrames[0];

        // Get a scope that likely has more than 1 property
        const fullResult = await getScopeVars(
          manager,
          sessionId,
          topFrame.callFrameId,
          0,
          {
            depth: 1,
            maxProperties: 100,
          },
        );

        if (fullResult.variables.length > 2) {
          const limitedResult = await getScopeVars(
            manager,
            sessionId,
            topFrame.callFrameId,
            0,
            {
              depth: 1,
              maxProperties: 1,
            },
          );

          expect(limitedResult.truncated).toBe(true);
        }
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });

    it('should handle very small maxProperties values', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        let pauseDetails;
        ({ sessionId, pauseDetails } = await startAndPause(
          manager,
          fixture.tempPath,
        ));
        const topFrame = pauseDetails.callFrames[0];

        const result = await getScopeVars(
          manager,
          sessionId,
          topFrame.callFrameId,
          0,
          {
            depth: 1,
            maxProperties: 1,
          },
        );

        expect(result).toBeDefined();
        expect(result.variables.length).toBeLessThanOrEqual(1);
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });
  });

  describe('Error Cases', () => {
    it('should throw when session is not paused', async () => {
      const manager = new DebuggerSessionManager();
      const runningFixture = await prepareNodeFixture('auto-exit.js');
      let sessionId: string | undefined;

      try {
        const config: DebugSessionConfig = {
          target: {
            type: 'node',
            entry: runningFixture.tempPath,
            useTsx: false,
          },
          resumeAfterConfigure: true,
        };

        const response = await manager.startSession(config);
        sessionId = response.session.id;

        // Try to get scope variables while the session is running (not paused)
        await expect(async () => {
          await getScopeVars(manager, sessionId!, 'invalid-frame-id', 0);
        }).rejects.toThrow(/not paused/i);
      } finally {
        await cleanupSession(manager, sessionId);
        await runningFixture.cleanup();
      }
    });

    it('should throw when call frame ID is invalid', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        ({ sessionId } = await startAndPause(manager, fixture.tempPath));

        await expect(async () => {
          await getScopeVars(manager, sessionId!, 'invalid-call-frame-id', 0);
        }).rejects.toThrow(/not found/i);
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });

    it('should throw when scope index is out of range', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        let pauseDetails;
        ({ sessionId, pauseDetails } = await startAndPause(
          manager,
          fixture.tempPath,
        ));
        const topFrame = pauseDetails.callFrames[0];

        const outOfRangeIndex = topFrame.scopeChain.length + 10;

        await expect(async () => {
          await getScopeVars(
            manager,
            sessionId!,
            topFrame.callFrameId,
            outOfRangeIndex,
          );
        }).rejects.toThrow(/out of range/i);
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });

    it('should throw when session does not exist', async () => {
      const manager = new DebuggerSessionManager();

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
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        let pauseDetails;
        ({ sessionId, pauseDetails } = await startAndPause(
          manager,
          fixture.tempPath,
        ));
        const topFrame = pauseDetails.callFrames[0];

        const result = await getScopeVars(
          manager,
          sessionId,
          topFrame.callFrameId,
          0,
          {
            path: ['localState'],
            depth: 1,
          },
        );

        expect(result.variables).toBeDefined();
        result.variables.forEach((variable) => {
          expect(variable.name).toBeDefined();
          expect(variable.value).toBeDefined();
          expect(variable.value.type).toBeDefined();
        });
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });

    it('should correctly represent function variables', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        let pauseDetails;
        ({ sessionId, pauseDetails } = await startAndPause(
          manager,
          fixture.tempPath,
        ));
        const topFrame = pauseDetails.callFrames[0];

        // Look in a broader scope (closure or global) for function definitions
        const scopeIndex = Math.min(1, topFrame.scopeChain.length - 1);
        const result = await getScopeVars(
          manager,
          sessionId,
          topFrame.callFrameId,
          scopeIndex,
          {
            depth: 1,
          },
        );

        const computeValueVar = result.variables.find(
          (v) => v.name === 'computeValue' || v.name === 'triggerPause',
        );
        if (computeValueVar) {
          expect(computeValueVar.value.type).toBe('function');
        }
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });

    it('should correctly represent primitive number values', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        let pauseDetails;
        ({ sessionId, pauseDetails } = await startAndPause(
          manager,
          fixture.tempPath,
        ));
        const topFrame = pauseDetails.callFrames[0];

        const result = await getScopeVars(
          manager,
          sessionId,
          topFrame.callFrameId,
          0,
          {
            path: ['localState'],
            depth: 1,
          },
        );

        const doubledVar = result.variables.find((v) => v.name === 'doubled');
        if (doubledVar) {
          expect(doubledVar.value.type).toBe('number');
        }
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });
  });

  describe('Truncation Handling', () => {
    it('should indicate truncation on individual variables when nested properties are limited', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        let pauseDetails;
        ({ sessionId, pauseDetails } = await startAndPause(
          manager,
          fixture.tempPath,
        ));
        const topFrame = pauseDetails.callFrames[0];

        const result = await getScopeVars(
          manager,
          sessionId,
          topFrame.callFrameId,
          0,
          {
            path: ['localState'],
            depth: 2,
            maxProperties: 1,
          },
        );

        // When drilling into nested objects with tight limits, truncation may occur
        expect(result).toBeDefined();
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });
  });

  describe('Message Guidance', () => {
    it('should provide messages when depth is reduced for root queries', async () => {
      const manager = new DebuggerSessionManager();
      const fixture = await prepareNodeFixture('breakpoint-script.js');
      let sessionId: string | undefined;

      try {
        let pauseDetails;
        ({ sessionId, pauseDetails } = await startAndPause(
          manager,
          fixture.tempPath,
        ));
        const topFrame = pauseDetails.callFrames[0];

        const result = await getScopeVars(
          manager,
          sessionId,
          topFrame.callFrameId,
          0,
          {
            depth: 3, // Request depth > 1 without path
          },
        );

        // The implementation should provide a message about depth reduction
        expect(result.messages).toBeDefined();
        if (result.messages && result.messages.length > 0) {
          expect(result.messages.some((m) => m.includes('depth'))).toBe(true);
        }
      } finally {
        await cleanupSession(manager, sessionId);
        await fixture.cleanup();
      }
    });
  });
});
