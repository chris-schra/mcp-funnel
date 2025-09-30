import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import getPort from 'get-port';
import { waitFor } from './async-helpers.js';

/**
 * Configuration options for launching Node.js inspector
 */
export interface InspectorLaunchOptions {
  inspectBrk?: boolean;
}

/**
 * Handle for managing an active inspector session
 */
export interface InspectorHandle {
  process: ChildProcess;
  inspectorUrl: string;
  port: number;
  cleanup(): Promise<void>;
}

/**
 * Parses the Inspector WebSocket URL from Node.js debug output
 * @param output - Debug output text from Node.js process
 * @returns WebSocket URL string or null if not found
 */
export function parseInspectorUrl(output: string): string | null {
  const match = output.match(/Debugger listening on (ws:\/\/[^\s]+)/);
  return match ? match[1] : null;
}

/**
 * Terminates a running child process gracefully with timeout fallback
 * @param child - Child process to terminate
 */
export async function terminateProcess(child: ChildProcess): Promise<void> {
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

/**
 * Launches a Node.js process with inspector enabled and waits for connection
 * @param scriptPath - Path to the script to execute with inspector
 * @param options - Inspector launch configuration options
 * @returns Inspector handle with process reference and cleanup function
 */
export async function launchInspector(
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

/**
 * Creates a CDP command sender function for a WebSocket connection
 * @param ws - WebSocket connection to CDP endpoint
 * @returns Function that sends CDP commands and awaits responses
 */
export function createCdpCommandSender(ws: WebSocket) {
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

/**
 * Collects console events from CDP WebSocket connection
 * @param ws - WebSocket connection to CDP endpoint
 * @param expectedCount - Number of console events to wait for
 * @param timeoutMs - Maximum time to wait for events in milliseconds
 * @returns Array of collected console event objects
 */
export async function collectConsoleEvents(
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

/**
 * Opens a WebSocket connection to the specified URL
 * @param url - WebSocket URL to connect to
 * @returns Promise resolving to connected WebSocket instance
 */
export async function openWebSocket(url: string): Promise<WebSocket> {
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
