import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import type {
  DebugSessionConfig,
  StartDebugSessionResponse,
} from '../src/types/index.js';
import { waitFor } from './utils/async-helpers.js';
import {
  prepareNodeFixture,
  type FixtureHandle,
} from './utils/fixture-manager.js';
import {
  createNodeTarget,
  waitForSessionTermination,
} from './utils/session-helpers.js';

describe(
  'DebuggerSessionManager Integration Tests - Workflows',
  () => {
    let manager: DebuggerSessionManager;
    const fixtures: FixtureHandle[] = [];

    beforeEach(() => {
      manager = new DebuggerSessionManager();
    });

    afterEach(async () => {
      // Clean up all fixtures
      await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
      fixtures.length = 0;
    });

    const startSession = async (
      config: DebugSessionConfig,
    ): Promise<StartDebugSessionResponse> => {
      return manager.startSession(config);
    };

    describe('Breakpoint Debugging Workflow', () => {
      it('should start session with breakpoints, hit breakpoint, inspect variables, and continue', async () => {
        const fixture = await prepareNodeFixture('breakpoint-script.ts');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.sourcePath);
        const response = await startSession({
          target,
          breakpoints: [
            {
              location: {
                url: fixture.sourcePath,
                lineNumber: 13, // debugger statement line (0-indexed)
              },
            },
          ],
        });

        // Verify session started and is paused
        expect(response.session.state.status).toBe('paused');
        expect(response.initialPause).toBeDefined();
        expect(response.initialPause?.reason).toMatch('breakpoint');

        // Verify breakpoint was set
        expect(response.breakpoints).toBeDefined();
        expect(response.breakpoints?.length).toBeGreaterThan(0);

        const sessionId = response.session.id;

        // Get fresh pause details to ensure scope info is fully populated
        const pauseResult = await manager.runCommand({
          sessionId,
          action: 'pause',
        });
        const pauseDetails = pauseResult.pause!;
        const callFrame = pauseDetails.callFrames[0];

        // Inspect variables in the top scope
        const scopeResult = await manager.getScopeVariables({
          sessionId,
          callFrameId: callFrame.callFrameId,
          scopeNumber: 0,
          depth: 2,
        });

        expect(scopeResult.variables).toBeDefined();
        // Verify we can see the payload variable
        const payloadVar = scopeResult.variables.find(
          (v) => v.name === 'payload',
        );
        expect(payloadVar).toBeDefined();
        expect(payloadVar?.value.type).toBe('object');

        // Continue execution
        const continueResult = await manager.runCommand({
          sessionId,
          action: 'continue',
        });

        // After continue, execution either pauses at another breakpoint or completes
        // In this test, there's only one breakpoint, so execution should complete without pausing
        expect(continueResult.pause).toBeUndefined();

        // Wait for process to complete
        await waitForSessionTermination(manager, sessionId);
      });

      it('should handle multiple breakpoints in sequence', async () => {
        const fixture = await prepareNodeFixture('breakpoint-script.ts');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.sourcePath);
        const response = await startSession({
          target,
          breakpoints: [
            {
              location: { url: fixture.sourcePath, lineNumber: 12 },
            },
            {
              location: { url: fixture.sourcePath, lineNumber: 13 },
            },
          ],
        });

        expect(response.session.state.status).toBe('paused');
        expect(response.breakpoints?.length).toBe(2);

        const sessionId = response.session.id;

        // Continue past first breakpoint
        await manager.runCommand({ sessionId, action: 'continue' });

        // Should hit second breakpoint, be transitioning, running, or complete
        const snapshot = manager.getSnapshot(sessionId);
        expect(['paused', 'running', 'terminated', 'transitioning']).toContain(
          snapshot.session.state.status,
        );
      });
    });

    describe('Stepping Workflow', () => {
      it('should pause at runtime, step over, step into, and step out', async () => {
        const fixture = await prepareNodeFixture('breakpoint-script.ts');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.sourcePath);
        const response = await startSession({
          target,
          breakpoints: [
            {
              location: { url: fixture.sourcePath, lineNumber: 13 },
            },
          ],
        });

        expect(response.session.state.status).toBe('paused');
        const sessionId = response.session.id;

        // Step over
        const stepOverResult = await manager.runCommand({
          sessionId,
          action: 'stepOver',
        });

        expect(stepOverResult.pause).toBeDefined();
        const pauseAfterStepOver = stepOverResult.pause!;
        const lineAfterStepOver =
          pauseAfterStepOver.callFrames[0]?.location.lineNumber;

        // Should have moved to next line
        expect(lineAfterStepOver).toBeGreaterThan(13);

        // Step into (if there's a function call, otherwise just steps)
        const stepIntoResult = await manager.runCommand({
          sessionId,
          action: 'stepInto',
        });

        expect(stepIntoResult.pause).toBeDefined();

        // Step out (return to caller or continue)
        const stepOutResult = await manager.runCommand({
          sessionId,
          action: 'stepOut',
        });

        // Should either pause at caller or resume
        expect(stepOutResult.pause || stepOutResult.resumed).toBeTruthy();
      });

      it('should support continueToLocation', async () => {
        const fixture = await prepareNodeFixture('breakpoint-script.ts');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.sourcePath);
        const response = await startSession({
          target,
          breakpoints: [
            {
              location: { url: fixture.sourcePath, lineNumber: 12 },
            },
          ],
        });

        expect(response.session.state.status).toBe('paused');
        const sessionId = response.session.id;

        // Continue to a specific location
        const result = await manager.runCommand({
          sessionId,
          action: 'continueToLocation',
          location: { url: fixture.sourcePath, lineNumber: 14 },
        });

        // Should either pause at target location or continue past it
        expect(result.pause || result.resumed).toBeTruthy();
      });
    });

    describe('Output Collection Workflow', () => {
      it('should collect output, query with filters, and verify results', async () => {
        const fixture = await prepareNodeFixture('console-output.js');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.sourcePath);
        const response = await startSession({
          target,
          resumeAfterConfigure: true,
        });

        expect(response.session.state.status).toBe('running');
        const sessionId = response.session.id;

        // Wait for console output from the script - specifically wait for all 3 initial messages
        await waitFor(
          async () => {
            const output = await manager.queryOutput({ sessionId });
            const consoleCount = output.entries.filter(
              (entry) =>
                entry.kind === 'console' && entry.entry.level !== 'info',
            ).length;
            return consoleCount >= 3 ? true : null;
          },
          { timeoutMs: 5000 },
        );

        // Query all output
        const allOutput = await manager.queryOutput({
          sessionId,
          limit: 100,
        });

        expect(allOutput.entries.length).toBeGreaterThan(0);

        // Verify we have different types of console output
        const hasLog = allOutput.entries.some(
          (entry) => entry.kind === 'console' && entry.entry.level === 'log',
        );
        const hasWarn = allOutput.entries.some(
          (entry) => entry.kind === 'console' && entry.entry.level === 'warn',
        );
        const hasError = allOutput.entries.some(
          (entry) => entry.kind === 'console' && entry.entry.level === 'error',
        );

        expect(hasLog).toBe(true);
        expect(hasWarn).toBe(true);
        expect(hasError).toBe(true);

        // Filter by log level
        const errorOnly = await manager.queryOutput({
          sessionId,
          levels: ['error'],
        });

        expect(errorOnly.entries.length).toBeGreaterThan(0);
        errorOnly.entries.forEach((entry) => {
          if (entry.kind === 'console') {
            expect(entry.entry.level).toBe('error');
          }
        });

        // Search for specific text
        const searchResult = await manager.queryOutput({
          sessionId,
          search: 'warning',
        });

        expect(searchResult.entries.length).toBeGreaterThan(0);
        expect(
          searchResult.entries.some((entry) => {
            if (entry.kind === 'console') {
              return entry.entry.text.toLowerCase().includes('warning');
            }
            return false;
          }),
        ).toBe(true);

        // Test pagination with cursor
        const firstPage = await manager.queryOutput({
          sessionId,
          limit: 2,
        });

        expect(firstPage.entries.length).toBeLessThanOrEqual(2);

        if (firstPage.nextCursor !== undefined) {
          const secondPage = await manager.queryOutput({
            sessionId,
            since: firstPage.nextCursor,
            limit: 2,
          });

          // Should get different entries
          expect(secondPage.entries.length).toBeGreaterThan(0);
          if (firstPage.entries.length > 0 && secondPage.entries.length > 0) {
            expect(secondPage.entries[0]?.cursor).not.toBe(
              firstPage.entries[0]?.cursor,
            );
          }
        }
      });
    });

    describe('Resume After Configure', () => {
      it('should run to completion when resumeAfterConfigure is true', async () => {
        const fixture = await prepareNodeFixture('console-output.js');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.sourcePath);
        const response = await startSession({
          target,
          resumeAfterConfigure: true,
        });

        // Should start in running state
        expect(response.session.state.status).toBe('running');
        expect(response.initialPause).toBeUndefined();

        const sessionId = response.session.id;

        // Wait for process to complete
        await waitForSessionTermination(manager, sessionId);
      });

      it('should pause on entry when resumeAfterConfigure is false', async () => {
        const fixture = await prepareNodeFixture('console-output.js');
        fixtures.push(fixture);

        const target = createNodeTarget(fixture.sourcePath);
        const response = await startSession({
          target,
          resumeAfterConfigure: false,
        });

        // Should start paused
        expect(response.session.state.status).toBe('paused');
        expect(response.initialPause).toBeDefined();
      });
    });
  },
  { timeout: 30000 },
);
