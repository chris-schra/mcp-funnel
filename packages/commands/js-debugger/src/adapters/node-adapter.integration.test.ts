import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import getPort from 'get-port';
import { NodeDebugAdapter } from './node-adapter.js';
import type { DebugState, ConsoleMessage } from '../types/index.js';
import { waitFor, sleep } from '../../test/utils/async-helpers.js';
import {
  FixtureHandle,
  prepareNodeFixture,
} from '../../test/utils/fixture-manager.js';

interface InspectorLaunchOptions {
  inspectBrk?: boolean;
}

interface InspectorHandle {
  process: ChildProcess;
  inspectorUrl: string;
  port: number;
  cleanup(): Promise<void>;
}

function parseInspectorUrl(output: string): string | null {
  const match = output.match(/Debugger listening on (ws:\/\/[^\s]+)/);
  return match ? match[1] : null;
}

async function terminateProcess(child: ChildProcess): Promise<void> {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  await waitFor(() => (child.exitCode !== null ? true : null), {
    timeoutMs: 2000,
    intervalMs: 50,
  }).catch(() => {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
  });
}

async function launchInspector(
  scriptPath: string,
  options: InspectorLaunchOptions = {},
): Promise<InspectorHandle> {
  const port = await getPort();
  const flag = options.inspectBrk === false ? '--inspect' : '--inspect-brk';
  const args = [`${flag}=${port}`, scriptPath];

  const child = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let inspectorUrl: string | null = null;
  let combinedOutput = '';

  const handleOutput = (data: Buffer) => {
    const text = data.toString();
    combinedOutput += text;
    const url = parseInspectorUrl(text);
    if (url) {
      inspectorUrl = url;
    }
  };

  child.stdout?.on('data', handleOutput);
  child.stderr?.on('data', handleOutput);

  try {
    await waitFor(
      () => {
        if (inspectorUrl) {
          return inspectorUrl;
        }
        if (child.exitCode !== null) {
          throw new Error(
            `Process exited before inspector was ready (code: ${child.exitCode})\nOutput: ${combinedOutput}`,
          );
        }
        return null;
      },
      { timeoutMs: 7000, intervalMs: 50 },
    );
  } catch (error) {
    await terminateProcess(child);
    throw error instanceof Error ? error : new Error(String(error));
  }

  return {
    process: child,
    inspectorUrl: inspectorUrl!,
    port,
    cleanup: async () => {
      child.stdout?.off('data', handleOutput);
      child.stderr?.off('data', handleOutput);
      await terminateProcess(child);
    },
  };
}

function createCdpCommandSender(ws: WebSocket) {
  let nextId = 0;

  return function sendCommand<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const messageId = ++nextId;

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`CDP command timeout: ${method}`));
      }, timeoutMs);

      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const handleMessage = (data: WebSocket.RawData) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.id === messageId) {
            cleanup();
            if (message.error) {
              reject(new Error(message.error.message));
            } else {
              resolve(message.result as T);
            }
          }
        } catch (error) {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        ws.off('message', handleMessage);
        ws.off('error', handleError);
      };

      ws.on('message', handleMessage);
      ws.once('error', handleError);

      ws.send(
        JSON.stringify({
          id: messageId,
          method,
          params,
        }),
      );
    });
  };
}

async function collectConsoleEvents(
  ws: WebSocket,
  expectedCount: number,
  timeoutMs = 4000,
) {
  const events: Array<{
    type: string;
    args: Array<{ value?: unknown; description?: string }>;
  }> = [];

  const handler = (data: WebSocket.RawData) => {
    const message = JSON.parse(data.toString());
    if (message.method === 'Runtime.consoleAPICalled') {
      events.push(message.params);
    }
  };

  const closeHandler = () => {
    if (events.length > 0) {
      // no-op, waitFor will resolve on next iteration
    }
  };

  ws.on('message', handler);
  ws.once('close', closeHandler);

  try {
    return await waitFor(
      () => (events.length >= expectedCount ? [...events] : null),
      { timeoutMs, intervalMs: 50 },
    );
  } finally {
    ws.off('message', handler);
    ws.off('close', closeHandler);
  }
}

async function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const handleOpen = () => {
      socket.off('error', handleError);
      resolve(socket);
    };
    const handleError = (error: Error) => {
      socket.off('open', handleOpen);
      reject(error);
    };
    socket.once('open', handleOpen);
    socket.once('error', handleError);
  });
}

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
