import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import { SessionManager } from './session-manager.js';
import { waitFor, sleep } from '../test/utils/async-helpers.js';
import {
  prepareNodeFixture,
  type FixtureHandle,
} from '../test/utils/fixture-manager.js';

const runRealSessionTests = process.env.JS_DEBUGGER_RUN_REAL === 'true';
const describeReal = runRealSessionTests ? describe : describe.skip;

describeReal('SessionManager (Node integration)', () => {
  let consoleFixture: FixtureHandle;
  let autoExitFixture: FixtureHandle;

  beforeAll(async () => {
    consoleFixture = await prepareNodeFixture('console-output.js');
    autoExitFixture = await prepareNodeFixture('auto-exit.js');
  });

  afterAll(async () => {
    await Promise.all([consoleFixture.cleanup(), autoExitFixture.cleanup()]);
  });

  beforeEach(() => {
    SessionManager.resetInstance();
  });

  afterEach(() => {
    SessionManager.resetInstance();
  });

  it('captures console output according to verbosity filters', async () => {
    const manager = SessionManager.getInstance();

    const sessionId = await manager.createSession({
      platform: 'node',
      target: consoleFixture.tempPath,
      captureConsole: true,
      consoleVerbosity: 'error-only',
      timeout: 2000,
    });

    const session = await waitFor(() => manager.getSession(sessionId) ?? null, {
      timeoutMs: 5000,
      intervalMs: 50,
    });

    await session.adapter.evaluate(
      'console.error("session-manager test error")',
    );

    const sessionWithOutput = await waitFor(
      () => {
        const current = manager.getSession(sessionId);
        if (!current) {
          return null;
        }
        return current.consoleOutput.length > 0 ? current : null;
      },
      { timeoutMs: 5000, intervalMs: 100 },
    );

    expect(sessionWithOutput.consoleOutput.length).toBeGreaterThan(0);
    expect(sessionWithOutput.consoleOutput[0]?.level).toBe('error');
    expect(sessionWithOutput.consoleOutput[0]?.message).toContain(
      'session-manager test error',
    );

    const listed = manager.listSessions().find((item) => item.id === sessionId);
    expect(listed).toBeDefined();

    manager.deleteSession(sessionId);
  });

  it('cleans up inactive sessions when thresholds are exceeded', async () => {
    const manager = SessionManager.getInstance(undefined, {
      sessionTimeoutMs: 100,
      enableAutoCleanup: false,
    });

    const sessionId = await manager.createSession({
      platform: 'node',
      target: autoExitFixture.tempPath,
      captureConsole: false,
      consoleVerbosity: 'none',
    });

    await waitFor(() => manager.getSession(sessionId) ?? null, {
      timeoutMs: 2000,
      intervalMs: 50,
    });

    await sleep(150);

    let cleanedCount = 0;
    let removed = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      cleanedCount = await manager.cleanupInactiveSessions();
      if (!manager.getSession(sessionId)) {
        removed = true;
        break;
      }
      await sleep(100);
    }

    if (!removed) {
      manager.deleteSession(sessionId);
    }

    expect(removed).toBe(true);
    expect(cleanedCount).toBeGreaterThanOrEqual(0);
  });
});
