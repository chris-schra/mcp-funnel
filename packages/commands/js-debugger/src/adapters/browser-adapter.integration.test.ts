import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import http from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import getPort from 'get-port';
import { chromium } from 'playwright';
import { BrowserAdapter } from './browser-adapter.js';
import type { DebugState, ConsoleMessage } from '../types/index.js';
import { waitFor } from '../../test/utils/async-helpers.js';
import {
  prepareBrowserFixturesRoot,
  type FixtureHandle,
} from '../../test/utils/fixture-manager.js';

interface ChromeHandle {
  process: ChildProcess;
  port: number;
  userDataDir: string;
  cleanup(): Promise<void>;
}

interface StaticServerHandle {
  baseUrl: string;
  close(): Promise<void>;
}

/**
 *
 */
async function launchHeadlessChromium(): Promise<ChromeHandle> {
  const port = await getPort();
  const executablePath = chromium.executablePath();
  const userDataDir = await fs.mkdtemp(
    path.join(tmpdir(), 'js-debugger-chrome-'),
  );

  const args = [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--force-color-profile=srgb',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];

  const child = spawn(executablePath, args, {
    stdio: 'ignore',
    detached: false,
  });

  try {
    await waitFor(
      async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/json/version`);
          if (!response.ok) {
            return null;
          }
          const json = await response.json();
          return json.webSocketDebuggerUrl ? json : null;
        } catch {
          return null;
        }
      },
      { timeoutMs: 7000, intervalMs: 100 },
    );
  } catch (error) {
    child.kill('SIGKILL');
    await fs.rm(userDataDir, { recursive: true, force: true });
    throw error;
  }

  return {
    process: child,
    port,
    userDataDir,
    cleanup: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await waitFor(() => (child.exitCode !== null ? true : null), {
          timeoutMs: 2000,
          intervalMs: 50,
        }).catch(() => child.kill('SIGKILL'));
      }
      await fs.rm(userDataDir, { recursive: true, force: true });
    },
  };
}

/**
 *
 * @param rootDir
 */
async function startStaticServer(rootDir: string): Promise<StaticServerHandle> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let relativePath = decodeURIComponent(url.pathname);

      if (relativePath.endsWith('/')) {
        relativePath = `${relativePath}index.html`;
      }

      if (relativePath === '/' || relativePath === '') {
        relativePath = '/simple-page.html';
      }

      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1);
      }

      const filePath = path.join(rootDir, relativePath);
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      const contentType =
        ext === '.html'
          ? 'text/html; charset=utf-8'
          : ext === '.js'
            ? 'application/javascript; charset=utf-8'
            : 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(
        `Not found: ${req.url}\n${error instanceof Error ? error.message : ''}`,
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://${address.address}:${address.port}`;

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

describe('BrowserAdapter integration', () => {
  let fixturesRoot: FixtureHandle;

  beforeAll(async () => {
    fixturesRoot = await prepareBrowserFixturesRoot();
  });

  afterAll(async () => {
    await fixturesRoot.cleanup();
  });

  it('pauses on debugger statement, inspects state, and captures console output', async () => {
    const chrome = await launchHeadlessChromium();
    const staticServer = await startStaticServer(fixturesRoot.tempPath);
    const adapter = new BrowserAdapter({
      host: '127.0.0.1',
      port: chrome.port,
    });
    const cdpClient = await chromium.connectOverCDP(
      `http://127.0.0.1:${chrome.port}`,
    );
    const [context] = cdpClient.contexts();
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${staticServer.baseUrl}/simple-page.html`);

    const pauseStates: DebugState[] = [];
    const consoleMessages: ConsoleMessage[] = [];
    let resumeCount = 0;

    adapter.onPaused((state) => pauseStates.push(state));
    adapter.onResumed(() => {
      resumeCount += 1;
    });
    adapter.onConsoleOutput((message) => {
      consoleMessages.push(message);
    });

    try {
      await adapter.connect('auto');

      const pauseState = await waitFor(() => pauseStates.shift() ?? null, {
        timeoutMs: 6000,
        intervalMs: 50,
      });

      expect(pauseState.status).toBe('paused');

      const stackTrace = await adapter.getStackTrace();
      expect(stackTrace.length).toBeGreaterThan(0);
      expect(stackTrace[0]?.functionName).toBe('triggerDebugger');

      const evaluation = await adapter.evaluate('window.__debugData.counter');
      expect(evaluation.value).toBe(1);

      await adapter.continue();

      await waitFor(
        () => (consoleMessages.length > 0 ? consoleMessages : null),
        { timeoutMs: 4000, intervalMs: 50 },
      );

      expect(
        consoleMessages.some(
          (msg) =>
            msg.message.includes('Browser fixture log') && msg.level === 'log',
        ),
      ).toBe(true);
      expect(resumeCount).toBeGreaterThanOrEqual(1);
    } finally {
      await adapter.disconnect();
      await cdpClient.close();
      await staticServer.close();
      await chrome.cleanup();
    }
  });
});
