import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { NodeDebugAdapter } from './node-adapter.js';
import type { DebugState, ConsoleMessage } from '../types/index.js';
import { waitFor, sleep } from '../../test/utils/async-helpers.js';
import {
  FixtureHandle,
  prepareNodeFixture,
} from '../../test/utils/fixture-manager.js';
import {
  launchInspector,
  createCdpCommandSender,
  collectConsoleEvents,
  openWebSocket,
} from '../../test/utils/inspector-helpers.js';

describe('Node.js CDP integration', () => {
  let consoleFixture: FixtureHandle;
  let autoExitFixture: FixtureHandle;

  beforeAll(async () => {
    consoleFixture = await prepareNodeFixture('console-output.js');
    autoExitFixture = await prepareNodeFixture('auto-exit.js');
  });

  afterAll(async () => {
    await Promise.all([consoleFixture.cleanup(), autoExitFixture.cleanup()]);
  });

  it('resumes from --inspect-brk and streams console output', async () => {
    const inspector = await launchInspector(consoleFixture.tempPath, {
      inspectBrk: true,
    });

    let ws: WebSocket | null = null;
    try {
      ws = await openWebSocket(inspector.inspectorUrl);
      const sendCommand = createCdpCommandSender(ws);

      await Promise.all([
        sendCommand('Runtime.enable'),
        sendCommand('Console.enable'),
      ]);
      await sendCommand('Debugger.enable');
      await sendCommand('Runtime.runIfWaitingForDebugger');

      const consoleEventsPromise = collectConsoleEvents(ws, 1, 6000);
      await sendCommand('Runtime.evaluate', {
        expression: "console.log('Inspector test log')",
      });

      const events = await consoleEventsPromise;
      const categories = events.map((event) => event.type);

      expect(categories).toContain('log');
      const findArg = (needle: string) =>
        events.find((event) =>
          event.args.some(
            (arg) => arg.value === needle || arg.description === needle,
          ),
        );

      expect(findArg('Inspector test log')).toBeDefined();
    } finally {
      if (ws) {
        ws.close();
      }
      await inspector.cleanup();
    }
  });

  it('connects with --inspect without pausing execution', async () => {
    const inspector = await launchInspector(autoExitFixture.tempPath, {
      inspectBrk: false,
    });

    let ws: WebSocket | null = null;
    let paused = false;

    try {
      ws = await openWebSocket(inspector.inspectorUrl);

      const pauseListener = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString());
        if (message.method === 'Debugger.paused') {
          paused = true;
        }
      };

      ws.on('message', pauseListener);

      const sendCommand = createCdpCommandSender(ws);
      await sendCommand('Debugger.enable');

      await sleep(500);
      expect(paused).toBe(false);

      ws.off('message', pauseListener);
    } finally {
      if (ws) {
        ws.close();
      }
      await inspector.cleanup();
    }
  });
});

describe('NodeDebugAdapter integration', () => {
  let breakpointFixture: FixtureHandle;

  beforeAll(async () => {
    breakpointFixture = await prepareNodeFixture('breakpoint-script.js');
  });

  afterAll(async () => {
    await breakpointFixture.cleanup();
  });

  it('exposes pause state, scopes, evaluation, and breakpoint control', async () => {
    const adapter = new NodeDebugAdapter();
    const pauseQueue: DebugState[] = [];
    const consoleMessages: ConsoleMessage[] = [];
    const resumeEvents: number[] = [];

    adapter.onPaused((state) => {
      pauseQueue.push(state);
    });
    adapter.onResumed(() => {
      resumeEvents.push(Date.now());
    });
    adapter.onConsoleOutput((message) => {
      consoleMessages.push(message);
    });

    await adapter.connect(breakpointFixture.tempPath);

    try {
      const firstPause = await waitFor(() => pauseQueue.shift() ?? null, {
        timeoutMs: 4000,
        intervalMs: 50,
      });

      expect(firstPause.status).toBe('paused');
      expect(['breakpoint', 'entry']).toContain(firstPause.pauseReason);

      const stackTrace = await adapter.getStackTrace();
      expect(stackTrace.length).toBeGreaterThan(0);

      const scopes = await adapter.getScopes(0);
      expect(scopes.length).toBeGreaterThan(0);

      const breakpointRegistration = await adapter.setBreakpoint(
        breakpointFixture.tempPath,
        10,
      );

      expect(breakpointRegistration.id).toBeTruthy();

      await adapter.continue();

      const secondPause = await waitFor(() => pauseQueue.shift() ?? null, {
        timeoutMs: 4000,
        intervalMs: 50,
      });

      expect(['breakpoint', 'entry', 'debugger']).toContain(
        secondPause.pauseReason,
      );

      await adapter.removeBreakpoint(breakpointRegistration.id);

      await adapter.continue();

      await waitFor(() => (consoleMessages.length >= 1 ? true : null), {
        timeoutMs: 2000,
        intervalMs: 50,
      });

      expect(consoleMessages.length).toBeGreaterThan(0);
      expect(resumeEvents.length).toBeGreaterThanOrEqual(2);
    } finally {
      await adapter.disconnect();
    }
  });
});
