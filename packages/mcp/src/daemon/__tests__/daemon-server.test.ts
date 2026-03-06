import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, type Server as NetServer, type Socket } from 'net';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DaemonServer } from '../daemon-server.js';
import type { DaemonConfig } from '../types.js';

// We test DaemonServer with a real MCPProxy-like mock
function createMockProxy() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

function createTestConfig(): DaemonConfig {
  const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    socketPath: join(tmpdir(), `.mcp-funnel-test-${id}.sock`),
    pidFile: join(tmpdir(), `.mcp-funnel-test-${id}.pid`),
    logFile: join(tmpdir(), `.mcp-funnel-test-${id}.log`),
    configPath: '/tmp/test-config.json',
  };
}

describe('DaemonServer', () => {
  let config: DaemonConfig;
  let mockProxy: ReturnType<typeof createMockProxy>;
  let daemon: DaemonServer;

  beforeEach(() => {
    config = createTestConfig();
    mockProxy = createMockProxy();
    // Cast mock as MCPProxy — DaemonServer only uses initialize, createSession, shutdown
    daemon = new DaemonServer(mockProxy as never, config);
  });

  afterEach(async () => {
    try {
      await daemon.stop();
    } catch {
      // Already stopped
    }
    // Clean up files
    for (const path of [config.socketPath, config.pidFile]) {
      try {
        unlinkSync(path);
      } catch {
        // Already cleaned
      }
    }
  });

  describe('start', () => {
    it('should initialize the proxy', async () => {
      await daemon.start();
      expect(mockProxy.initialize).toHaveBeenCalledOnce();
    });

    it('should create PID file with current process PID', async () => {
      await daemon.start();
      const pid = readFileSync(config.pidFile, 'utf-8').trim();
      expect(parseInt(pid, 10)).toBe(process.pid);
    });

    it('should create the Unix socket', async () => {
      await daemon.start();
      expect(existsSync(config.socketPath)).toBe(true);
    });

    it('should clean up stale socket files', async () => {
      // Create a stale socket file
      writeFileSync(config.socketPath, 'stale');
      await daemon.start();
      // Should have replaced the stale file with a real socket
      expect(existsSync(config.socketPath)).toBe(true);
    });

    it('should reject if another daemon is running on the same socket', async () => {
      // Write a PID file with a PID that is running but isn't us
      // Use ppid (our parent process) — guaranteed to exist and be signalable
      const otherPid = process.ppid;
      writeFileSync(config.pidFile, otherPid.toString());
      writeFileSync(config.socketPath, 'taken');

      await expect(daemon.start()).rejects.toThrow('Another daemon is already running');
    });
  });

  describe('client connections', () => {
    it('should accept client connections and create sessions', async () => {
      await daemon.start();

      // Connect a client
      const client = await connectToSocket(config.socketPath);

      // Wait for the daemon to process the connection
      await new Promise((r) => setTimeout(r, 100));

      expect(mockProxy.createSession).toHaveBeenCalledOnce();
      client.destroy();
    });

    it('should handle multiple concurrent clients', async () => {
      await daemon.start();

      const clients = await Promise.all([
        connectToSocket(config.socketPath),
        connectToSocket(config.socketPath),
        connectToSocket(config.socketPath),
      ]);

      await new Promise((r) => setTimeout(r, 100));

      expect(mockProxy.createSession).toHaveBeenCalledTimes(3);
      clients.forEach((c) => c.destroy());
    });
  });

  describe('stop', () => {
    it('should shut down the proxy', async () => {
      await daemon.start();
      await daemon.stop();
      expect(mockProxy.shutdown).toHaveBeenCalledOnce();
    });

    it('should remove socket and PID files', async () => {
      await daemon.start();
      await daemon.stop();
      expect(existsSync(config.socketPath)).toBe(false);
      expect(existsSync(config.pidFile)).toBe(false);
    });

    it('should disconnect all active clients', async () => {
      await daemon.start();

      const client = await connectToSocket(config.socketPath);
      await new Promise((r) => setTimeout(r, 100));

      const closePromise = new Promise<void>((resolve) => {
        client.on('close', () => resolve());
      });

      await daemon.stop();
      await closePromise; // Client should have been disconnected
    });

    it('should be idempotent', async () => {
      await daemon.start();
      await daemon.stop();
      await daemon.stop(); // Should not throw
    });
  });
});

function connectToSocket(socketPath: string): Promise<Socket> {
  const { connect } = require('net') as typeof import('net');
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    socket.once('connect', () => {
      socket.removeAllListeners('error');
      resolve(socket);
    });
    socket.once('error', reject);
  });
}
