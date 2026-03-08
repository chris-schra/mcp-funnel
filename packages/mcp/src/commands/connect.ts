import { connect, type Socket } from 'net';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  DEFAULT_SOCKET_PATH,
  DEFAULT_PID_FILE,
  DAEMON_STARTUP_TIMEOUT_MS,
  DAEMON_POLL_INTERVAL_MS,
} from '../daemon/index.js';

/**
 * Connects to the mcp-funnel daemon via Unix domain socket.
 * Bridges stdio (what Claude Code speaks) to the socket (what the daemon speaks).
 * Auto-starts the daemon if not running.
 *
 * @param socketPath - Override for the Unix domain socket path (default: ~/.mcp-funnel.sock)
 * @param configPath - Config file path to pass to the daemon on auto-start
 */
export async function runConnect(socketPath?: string, configPath?: string): Promise<void> {
  const targetSocket = socketPath ?? DEFAULT_SOCKET_PATH;

  // Try to connect, auto-start daemon if needed
  let socket: Socket;
  try {
    socket = await connectToSocket(targetSocket);
  } catch {
    // Daemon not running — auto-start it
    console.error('[connect] Daemon not running, starting...');
    await autoStartDaemon(configPath);
    socket = await connectToSocket(targetSocket);
  }

  console.error('[connect] Connected to daemon');

  // Bridge stdio <-> socket
  // stdin -> socket (Claude Code sends MCP messages to stdin)
  process.stdin.pipe(socket);
  // socket -> stdout (daemon's MCP responses go to stdout for Claude Code)
  socket.pipe(process.stdout);

  // Handle disconnection
  socket.on('close', () => {
    console.error('[connect] Daemon connection closed');
    process.exit(0);
  });

  socket.on('error', (error) => {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EPIPE' && code !== 'ECONNRESET') {
      console.error(`[connect] Socket error: ${error.message}`);
    }
    process.exit(1);
  });

  // Handle our own shutdown
  process.on('SIGINT', () => {
    socket.destroy();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    socket.destroy();
    process.exit(0);
  });
}

function connectToSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);

    socket.once('connect', () => {
      socket.removeAllListeners('error');
      resolve(socket);
    });

    socket.once('error', (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

async function autoStartDaemon(configPath?: string): Promise<void> {
  // Check if daemon process exists but socket is gone (stale PID)
  if (existsSync(DEFAULT_PID_FILE)) {
    const pid = parseInt(readFileSync(DEFAULT_PID_FILE, 'utf-8').trim(), 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0);
        // Process exists but socket doesn't work — wait a bit, it might be starting
        console.error(`[connect] Daemon PID ${pid} exists, waiting for socket...`);
      } catch {
        // Process doesn't exist, stale PID file
      }
    }
  }

  // Spawn the daemon process in detached mode.
  // In bundled builds, import.meta.url points to the bundle (dist/cli.js),
  // so we resolve relative to the bundle's own directory.
  const thisFile = fileURLToPath(import.meta.url);
  const cliPath = resolve(dirname(thisFile), 'cli.js');

  const daemonArgs = configPath ? ['daemon', configPath] : ['daemon'];
  const child = spawn(process.execPath, [cliPath, ...daemonArgs], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'], // Capture stderr for startup logging
  });

  // Log daemon stderr during startup
  child.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) console.error(`[daemon-startup] ${line}`);
  });

  child.unref(); // Allow this process to exit independently

  // Wait for the socket to become available
  const deadline = Date.now() + DAEMON_STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(DEFAULT_SOCKET_PATH)) {
      try {
        // Try to actually connect (file existing != server listening)
        const testSocket = await connectToSocket(DEFAULT_SOCKET_PATH);
        testSocket.destroy();
        console.error('[connect] Daemon started successfully');
        return;
      } catch {
        // Socket file exists but not yet accepting connections
      }
    }
    await new Promise((r) => setTimeout(r, DAEMON_POLL_INTERVAL_MS));
  }

  throw new Error(`Daemon failed to start within ${DAEMON_STARTUP_TIMEOUT_MS / 1000}s`);
}
