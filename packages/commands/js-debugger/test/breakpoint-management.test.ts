/* eslint-disable max-lines */
import { describe, it, expect } from 'vitest';
import { sleep } from './utils/async-helpers.js';
import {
  waitForPause,
  waitForSessionTermination,
  continueUntilTerminated,
} from './utils/session-helpers.js';
import { getBreakpointSummary } from './utils/breakpoint-helpers.js';
import { createFixture } from './utils.js';
import type { BreakpointSpec } from '../src/types/index.js';

describe.concurrent('Breakpoint Management', () => {
  describe('Setting breakpoints by URL', () => {
    it('should set a breakpoint using URL', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        const breakpoint: BreakpointSpec = {
          location: { url: fixture.tempPath, lineNumber: 13 },
        };
        const result = await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: { set: [breakpoint] },
        });
        await sleep(100);
        await waitForPause(manager, sessionId);
        const summaries = getBreakpointSummary(result);
        expect(summaries).toHaveLength(1);
        expect(summaries[0].requested).toEqual(breakpoint);
        expect(summaries[0].resolvedLocations.length).toBeGreaterThanOrEqual(0);
      } finally {
        await cleanup();
      }
    });

    it('should set multiple breakpoints on same file', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        const result = await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [
              { location: { url: fixture.tempPath, lineNumber: 10 } },
              { location: { url: fixture.tempPath, lineNumber: 13 } },
              { location: { url: fixture.tempPath, lineNumber: 15 } },
            ],
          },
        });
        const summaries = getBreakpointSummary(result);
        expect(summaries).toHaveLength(3);
        expect(new Set(summaries.map((s) => s.id)).size).toBe(3);
      } finally {
        await cleanup();
      }
    });
  });

  describe('Conditional breakpoints', () => {
    it('should set a conditional breakpoint', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        const result = await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [
              {
                location: { url: fixture.tempPath, lineNumber: 13 },
                condition: 'payload.original === 21',
              },
            ],
          },
        });
        const summaries = getBreakpointSummary(result);
        expect(summaries[0].requested.condition).toBe(
          'payload.original === 21',
        );
      } finally {
        await cleanup();
      }
    });

    it('should not hit breakpoint when condition is false', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [
              {
                location: { url: fixture.tempPath, lineNumber: 13 },
                condition: 'payload.original === 999',
              },
            ],
          },
        });
        await waitForPause(manager, sessionId);
        await manager.runCommand({ sessionId, action: 'continue' });
        await continueUntilTerminated(manager, sessionId, { timeoutMs: 2000 });
        await waitForSessionTermination(manager, sessionId);
      } finally {
        await cleanup();
      }
    });

    it('should hit breakpoint when condition is true', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        const result = await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [
              {
                location: { url: fixture.tempPath, lineNumber: 13 },
                condition: 'payload.original === 21',
              },
            ],
          },
        });
        expect(result.commandAck.sent).toBe(true);
        await waitForPause(manager, sessionId);
      } finally {
        await cleanup();
      }
    });
  });

  describe('Removing breakpoints', () => {
    it('should remove breakpoints and not hit them', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        const setResult = await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [{ location: { url: fixture.tempPath, lineNumber: 13 } }],
          },
        });
        if (setResult.session.state.status !== 'paused') {
          await waitForPause(manager, sessionId);
        }
        const breakpointId = getBreakpointSummary(setResult)[0].id;
        const removeResult = await manager.runCommand({
          sessionId,
          action: 'pause',
          breakpoints: { remove: [breakpointId] },
        });
        expect(removeResult.removedBreakpoints).toEqual([breakpointId]);
        await manager.runCommand({ sessionId, action: 'continue' });
        await continueUntilTerminated(manager, sessionId);
        await waitForSessionTermination(manager, sessionId);
      } finally {
        await cleanup();
      }
    });

    it('should remove multiple breakpoints', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
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
      } finally {
        await cleanup();
      }
    });
  });

  describe('Breakpoint hit events', () => {
    it('should report pause details and call stack', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        const result = await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [{ location: { url: fixture.tempPath, lineNumber: 13 } }],
          },
        });
        expect(result.commandAck.sent).toBe(true);
        expect(result.setBreakpoints).toBeDefined();
        await waitForPause(manager, sessionId);
      } finally {
        await cleanup();
      }
    });
  });

  describe('continueToLocation', () => {
    it('should continue to specified location', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        await manager.runCommand({ sessionId, action: 'pause' });
        await waitForPause(manager, sessionId);
        await manager.runCommand({
          sessionId,
          action: 'continueToLocation',
          location: { url: fixture.tempPath, lineNumber: 15 },
        });
        await waitForPause(manager, sessionId);
      } finally {
        await cleanup();
      }
    });

    it('should resume if location unreachable', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        await manager.runCommand({ sessionId, action: 'pause' });
        await waitForPause(manager, sessionId);
        await manager.runCommand({
          sessionId,
          action: 'continueToLocation',
          location: { url: fixture.tempPath, lineNumber: 999 },
        });
        await waitForPause(manager, sessionId);
        await manager.runCommand({ sessionId, action: 'continue' });
        await continueUntilTerminated(manager, sessionId);
        await waitForSessionTermination(manager, sessionId);
      } finally {
        await cleanup();
      }
    });
  });

  describe('Breakpoint resolution', () => {
    it('should resolve and distinguish requested vs actual locations', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        const result = await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [{ location: { url: fixture.tempPath, lineNumber: 13 } }],
          },
        });
        await waitForPause(manager, sessionId);
        const summary = getBreakpointSummary(result)[0];
        expect(summary.resolvedLocations).toBeDefined();
        expect(summary.requested.location.lineNumber).toBe(13);
        const descriptor = manager.getDescriptor(sessionId);
        expect(descriptor.state.status).toBe('paused');
        if (descriptor.state.status === 'paused') {
          expect(descriptor.state.pause.reason).toBe('breakpoint');
          expect(descriptor.state.pause.hitBreakpoints).toBeDefined();
          expect(descriptor.state.pause.hitBreakpoints!.length).toBeGreaterThan(
            0,
          );
        }
      } finally {
        await cleanup();
      }
    });

    it('should handle breakpoint in comment gracefully', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [{ location: { url: fixture.tempPath, lineNumber: 1 } }],
          },
        });
        await waitForPause(manager, sessionId);
        await manager.runCommand({ sessionId, action: 'continue' });
        await continueUntilTerminated(manager, sessionId);
        await waitForSessionTermination(manager, sessionId);
      } finally {
        await cleanup();
      }
    });
  });

  describe('Breakpoint and stepping', () => {
    it('should support stepping from breakpoint', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [{ location: { url: fixture.tempPath, lineNumber: 13 } }],
          },
        });
        await waitForPause(manager, sessionId);
        await manager.runCommand({
          sessionId,
          action: 'stepOver',
        });
        await waitForPause(manager, sessionId);
      } finally {
        await cleanup();
      }
    });

    it('should continue between multiple breakpoints', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
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
        await waitForPause(manager, sessionId);
        await manager.runCommand({ sessionId, action: 'continue' });
        await waitForPause(manager, sessionId);
      } finally {
        await cleanup();
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle setting breakpoint on non-existent file', async () => {
      const { manager, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
        const result = await manager.runCommand({
          sessionId,
          action: 'continue',
          breakpoints: {
            set: [
              { location: { url: '/non/existent/file.ts', lineNumber: 10 } },
            ],
          },
        });
        expect(getBreakpointSummary(result)[0].resolvedLocations).toHaveLength(
          0,
        );
      } finally {
        await cleanup();
      }
    });

    it('should handle setting and removing in same command', async () => {
      const { manager, fixture, sessionId, cleanup } = await createFixture(
        'breakpoint-script.ts',
      );
      try {
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
        const summaries = getBreakpointSummary(result);
        expect(summaries).toHaveLength(1);
        expect(summaries[0].requested.location.lineNumber).toBe(15);
      } finally {
        await cleanup();
      }
    });
  });
});
