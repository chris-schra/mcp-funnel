import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import { prepareNodeFixture } from './utils/fixture-manager.js';
import { startAndPause, getScopeVars } from './utils/scope-helpers.js';
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

  describe('Basic Scope Inspection', () => {
    it('should retrieve variables from the local scope at depth 1', async () => {
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));
      const topFrame = pauseDetails.callFrames[0];

      expect(topFrame).toBeDefined();
      expect(topFrame.scopeChain.length).toBeGreaterThan(0);

      const result = await getScopeVars(manager, sessionId, topFrame.callFrameId, 0, { depth: 1 });

      expect(result).toBeDefined();
      expect(result.variables).toBeDefined();
      expect(Array.isArray(result.variables)).toBe(true);
      expect(result.path).toEqual([]);
    }, 20000);

    it('should find expected variables in the local scope', async () => {
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(manager, sessionId, topFrame.callFrameId, 0, { depth: 1 });

      // The breakpoint-script.js fixture defines these variables in triggerPause function:
      // - localState (object with doubled and nested properties)
      const varNames = result.variables.map((v) => v.name);
      expect(varNames).toContain('localState');
    });

    it('should navigate the scope chain at different indices', async () => {
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));
      const topFrame = pauseDetails.callFrames[0];

      expect(topFrame.scopeChain.length).toBeGreaterThan(1);

      // Test accessing different scopes in the chain
      for (let i = 0; i < Math.min(topFrame.scopeChain.length, 3); i++) {
        const result = await getScopeVars(manager, sessionId, topFrame.callFrameId, i);
        expect(result).toBeDefined();
        expect(result.variables).toBeDefined();
      }
    });
  });

  describe('Call Frame Navigation', () => {
    it('should access variables from different call frames', async () => {
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));

      // Access the top frame
      const topFrame = pauseDetails.callFrames[0];
      const topResult = await getScopeVars(manager, sessionId, topFrame.callFrameId, 0);
      expect(topResult).toBeDefined();

      // If there are multiple frames, test accessing a deeper one
      if (pauseDetails.callFrames.length > 1) {
        const deeperFrame = pauseDetails.callFrames[1];
        const deeperResult = await getScopeVars(manager, sessionId, deeperFrame.callFrameId, 0);
        expect(deeperResult).toBeDefined();
      }
    });
  });

  describe('Depth Control', () => {
    it('should return shallow variables at depth 1', async () => {
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(manager, sessionId, topFrame.callFrameId, 0, { depth: 1 });

      expect(result.variables).toBeDefined();
      // At depth 1, we should get top-level variables
      const localStateVar = result.variables.find((v) => v.name === 'localState');
      if (localStateVar) {
        // Children should not be deeply nested at depth 1 when path is not provided
        expect(localStateVar.children).toBeUndefined();
      }
    });

    it('should return deep nested variables at depth > 1 with path navigation', async () => {
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(manager, sessionId, topFrame.callFrameId, 0, {
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
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));
      const topFrame = pauseDetails.callFrames[0];

      // Navigate to the localState object
      const result = await getScopeVars(manager, sessionId, topFrame.callFrameId, 0, {
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
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(manager, sessionId, topFrame.callFrameId, 0, {
        path: ['localState', 'doubled'],
        depth: 1,
      });

      expect(result).toBeDefined();
      expect(result.path).toBeDefined();
    });

    it('should support object notation for property path segments', async () => {
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));
      const topFrame = pauseDetails.callFrames[0];

      const result = await getScopeVars(manager, sessionId, topFrame.callFrameId, 0, {
        path: [{ property: 'localState' }],
        depth: 1,
      });

      expect(result).toBeDefined();
      expect(result.variables).toBeDefined();
    });

    it('should navigate deep property paths', async () => {
      let pauseDetails;
      ({ sessionId, pauseDetails } = await startAndPause(manager, fixture.tempPath));
      const topFrame = pauseDetails.callFrames[0];

      // Navigate multiple levels deep - localState.nested.input
      const result = await getScopeVars(manager, sessionId, topFrame.callFrameId, 0, {
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
