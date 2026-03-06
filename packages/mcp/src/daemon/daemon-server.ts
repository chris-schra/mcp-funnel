import { createServer, type Server as NetServer, type Socket } from 'net';
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { v4 as uuid } from 'uuid';
import { logEvent, logError } from '@mcp-funnel/core';
import { MCPProxy } from '../proxy/mcp-proxy.js';
import { SocketTransport } from './socket-transport.js';
import type { DaemonConfig, DaemonSession } from './types.js';

/**
 * Multi-session daemon server that listens on a Unix domain socket.
 * Shares a single MCPProxy (and its child MCP server processes) across
 * all connected clients. Each client gets its own MCP Server session
 * backed by the shared ToolRegistry and Client connections.
 */
export class DaemonServer {
  private socketServer: NetServer | undefined;
  private sessions = new Map<string, DaemonSession>();
  private activeSockets = new Set<Socket>();
  private isShuttingDown = false;

  constructor(
    private proxy: MCPProxy,
    private config: DaemonConfig,
  ) {}

  async start(): Promise<void> {
    // Clean up stale socket file
    this.cleanupStaleSocket();

    // Write PID file
    writeFileSync(this.config.pidFile, process.pid.toString(), 'utf-8');

    // Initialize the proxy (connects to all target servers, discovers tools)
    await this.proxy.initialize();

    // Create Unix domain socket server
    this.socketServer = createServer((socket) => this.handleConnection(socket));

    // Handle server errors
    this.socketServer.on('error', (error) => {
      logError('daemon:server_error', error);
      console.error(`[daemon] Server error: ${error.message}`);
    });

    return new Promise((resolve, reject) => {
      this.socketServer!.listen(this.config.socketPath, () => {
        const sessionCount = 0;
        console.error(`[daemon] Listening on ${this.config.socketPath}`);
        console.error(`[daemon] PID: ${process.pid}`);
        console.error(`[daemon] Active sessions: ${sessionCount}`);
        logEvent('info', 'daemon:started', {
          socketPath: this.config.socketPath,
          pid: process.pid,
        });
        resolve();
      });

      this.socketServer!.on('error', (error) => {
        if (!this.socketServer!.listening) {
          reject(error);
        }
      });
    });
  }

  private handleConnection(socket: Socket): void {
    if (this.isShuttingDown) {
      socket.destroy();
      return;
    }

    const sessionId = uuid();
    const session: DaemonSession = {
      id: sessionId,
      connectedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    this.activeSockets.add(socket);

    console.error(`[daemon] Client connected: session=${sessionId} (total: ${this.sessions.size})`);
    logEvent('info', 'daemon:client_connected', {
      sessionId,
      totalSessions: this.sessions.size,
    });

    // Create a dedicated MCP Server session for this client using shared backend
    const transport = new SocketTransport(socket);
    this.proxy.createSession(transport);

    // Handle disconnection
    socket.on('close', () => {
      this.sessions.delete(sessionId);
      this.activeSockets.delete(socket);
      console.error(
        `[daemon] Client disconnected: session=${sessionId} (remaining: ${this.sessions.size})`,
      );
      logEvent('info', 'daemon:client_disconnected', {
        sessionId,
        remainingSessions: this.sessions.size,
      });
    });

    socket.on('error', (error) => {
      // EPIPE/ECONNRESET are normal when clients disconnect
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPIPE' && code !== 'ECONNRESET') {
        logError('daemon:client_error', error, { sessionId });
      }
    });
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.error('[daemon] Shutting down...');
    logEvent('info', 'daemon:stopping', { activeSessions: this.sessions.size });

    // Close all active client sockets
    for (const socket of this.activeSockets) {
      socket.destroy();
    }
    this.activeSockets.clear();
    this.sessions.clear();

    // Close the socket server
    if (this.socketServer) {
      await new Promise<void>((resolve) => {
        this.socketServer!.close(() => resolve());
      });
    }

    // Shut down the proxy (closes all target server connections)
    await this.proxy.shutdown();

    // Clean up files
    this.cleanupFiles();

    console.error('[daemon] Shutdown complete');
    logEvent('info', 'daemon:stopped');
  }

  private cleanupStaleSocket(): void {
    if (!existsSync(this.config.socketPath)) return;

    // Check if another daemon is already running
    if (existsSync(this.config.pidFile)) {
      const pidStr = readFileSync(this.config.pidFile, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid) && pid !== process.pid) {
        try {
          process.kill(pid, 0); // Check if process exists
          throw new Error(
            `Another daemon is already running (PID: ${pid}). ` +
              `Stop it first or remove ${this.config.socketPath}`,
          );
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'EPERM') {
            // Process exists but we can't signal it (e.g., different user)
            throw new Error(
              `Another daemon is already running (PID: ${pid}). ` +
                `Stop it first or remove ${this.config.socketPath}`,
            );
          }
          if (code !== 'ESRCH') {
            throw error;
          }
          // ESRCH = process doesn't exist, socket is stale
        }
      }
    }

    // Remove stale socket
    try {
      unlinkSync(this.config.socketPath);
      console.error(`[daemon] Removed stale socket: ${this.config.socketPath}`);
    } catch {
      // Ignore cleanup errors
    }
  }

  private cleanupFiles(): void {
    try {
      if (existsSync(this.config.socketPath)) {
        unlinkSync(this.config.socketPath);
      }
    } catch {
      // Ignore
    }
    try {
      if (existsSync(this.config.pidFile)) {
        const pidStr = readFileSync(this.config.pidFile, 'utf-8').trim();
        if (parseInt(pidStr, 10) === process.pid) {
          unlinkSync(this.config.pidFile);
        }
      }
    } catch {
      // Ignore
    }
  }
}
