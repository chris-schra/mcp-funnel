import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServerConnectionManager } from '../server-connection-manager.js';
import { EventEmitter } from 'events';
import type { ProxyConfig, TargetServer } from '@mcp-funnel/schemas';
import { ToolRegistry } from '../../../tool-registry/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Mock the connection-setup module
vi.mock('../connection-setup.js', () => ({
  connectToServer: vi.fn(),
}));

// Mock the reconnection-handler module
vi.mock('../reconnection-handler.js', () => ({
  createReconnectionManager: vi.fn(() => ({
    scheduleReconnection: vi.fn(),
    reset: vi.fn(),
    cancel: vi.fn(),
  })),
  attemptReconnection: vi.fn(),
  shouldAutoReconnect: vi.fn(() => true),
}));

// Mock the disconnect-handler module
vi.mock('../disconnect-handler.js', () => ({
  setupDisconnectHandling: vi.fn(),
  handleServerDisconnection: vi.fn(),
}));

// Mock logEvent and logError
vi.mock('@mcp-funnel/core', () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
  ReconnectionManager: vi.fn(),
}));

// Mock transport cache
vi.mock('../../../utils/transport/index.js', () => ({
  clearTransportCache: vi.fn(),
}));

describe('ServerConnectionManager - Slow Probe Mode', () => {
  let manager: ServerConnectionManager;
  let eventEmitter: EventEmitter;
  let config: ProxyConfig;
  let clients: Map<string, Client>;
  let toolRegistry: ToolRegistry;
  const configPath = '/test/config.json';

  const testServer: TargetServer = {
    name: 'test-server',
    command: 'echo',
    args: ['test'],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    eventEmitter = new EventEmitter();
    config = {
      servers: [testServer],
      reconnection: {
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
      },
    };
    clients = new Map();
    toolRegistry = {
      registerToolsForServer: vi.fn(),
      unregisterToolsForServer: vi.fn(),
    } as unknown as ToolRegistry;

    manager = new ServerConnectionManager(
      config,
      configPath,
      clients,
      toolRegistry,
      eventEmitter,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('SLOW_PROBE_INTERVAL_MS constant', () => {
    it('should be 60 seconds (60000ms)', () => {
      // Access the private static constant via the class
      expect((ServerConnectionManager as unknown as { SLOW_PROBE_INTERVAL_MS: number }).SLOW_PROBE_INTERVAL_MS).toBe(60000);
    });
  });

  describe('slow probe mode lifecycle', () => {
    it('should emit server.slow_probe_started event when entering slow probe mode', async () => {
      const emitSpy = vi.spyOn(eventEmitter, 'emit');

      // Access private method via any cast
      const managerAny = manager as unknown as {
        startSlowProbeMode: (server: TargetServer) => void;
      };
      managerAny.startSlowProbeMode(testServer);

      expect(emitSpy).toHaveBeenCalledWith('server.slow_probe_started', expect.objectContaining({
        serverName: 'test-server',
        status: 'slow_probe',
        probeIntervalMs: 60000,
      }));
    });

    it('should not start slow probe mode if already running for the server', () => {
      const emitSpy = vi.spyOn(eventEmitter, 'emit');

      const managerAny = manager as unknown as {
        startSlowProbeMode: (server: TargetServer) => void;
        slowProbeTimers: Map<string, ReturnType<typeof setInterval>>;
      };

      // Start slow probe mode
      managerAny.startSlowProbeMode(testServer);
      const firstCallCount = emitSpy.mock.calls.filter(
        (call) => call[0] === 'server.slow_probe_started'
      ).length;

      // Try to start again
      managerAny.startSlowProbeMode(testServer);
      const secondCallCount = emitSpy.mock.calls.filter(
        (call) => call[0] === 'server.slow_probe_started'
      ).length;

      // Should only emit once
      expect(firstCallCount).toBe(1);
      expect(secondCallCount).toBe(1);
    });

    it('should not start slow probe mode if shutting down', async () => {
      const emitSpy = vi.spyOn(eventEmitter, 'emit');

      // Initiate shutdown
      await manager.shutdown();

      const managerAny = manager as unknown as {
        startSlowProbeMode: (server: TargetServer) => void;
      };
      managerAny.startSlowProbeMode(testServer);

      expect(emitSpy).not.toHaveBeenCalledWith('server.slow_probe_started', expect.anything());
    });

    it('should clear timer when stopSlowProbeMode is called', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const managerAny = manager as unknown as {
        startSlowProbeMode: (server: TargetServer) => void;
        stopSlowProbeMode: (serverName: string) => void;
        slowProbeTimers: Map<string, ReturnType<typeof setInterval>>;
      };

      managerAny.startSlowProbeMode(testServer);
      expect(managerAny.slowProbeTimers.has('test-server')).toBe(true);

      managerAny.stopSlowProbeMode('test-server');
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(managerAny.slowProbeTimers.has('test-server')).toBe(false);
    });
  });

  describe('slow probe reconnection attempts', () => {
    it('should attempt reconnection every 60 seconds', async () => {
      const { connectToServer } = await import('../connection-setup.js');
      const mockConnectToServer = vi.mocked(connectToServer);

      // Make connection fail
      mockConnectToServer.mockRejectedValue(new Error('Connection failed'));

      const managerAny = manager as unknown as {
        startSlowProbeMode: (server: TargetServer) => void;
      };
      managerAny.startSlowProbeMode(testServer);

      // Fast-forward 60 seconds
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockConnectToServer).toHaveBeenCalledTimes(1);

      // Fast-forward another 60 seconds
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockConnectToServer).toHaveBeenCalledTimes(2);
    });

    it('should stop probing on successful reconnection', async () => {
      const { connectToServer } = await import('../connection-setup.js');
      const mockConnectToServer = vi.mocked(connectToServer);

      // First attempt fails, second succeeds
      mockConnectToServer
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({
          client: {} as Client,
          transport: {} as unknown as import('@modelcontextprotocol/sdk/shared/transport.js').Transport,
          connectedAt: new Date().toISOString(),
        });

      const managerAny = manager as unknown as {
        startSlowProbeMode: (server: TargetServer) => void;
        slowProbeTimers: Map<string, ReturnType<typeof setInterval>>;
      };
      managerAny.startSlowProbeMode(testServer);

      // Fast-forward 60 seconds - first attempt fails
      await vi.advanceTimersByTimeAsync(60000);
      expect(managerAny.slowProbeTimers.has('test-server')).toBe(true);

      // Fast-forward another 60 seconds - second attempt succeeds
      await vi.advanceTimersByTimeAsync(60000);
      expect(managerAny.slowProbeTimers.has('test-server')).toBe(false);
    });
  });

  describe('shutdown cleanup', () => {
    it('should clear all slow probe timers on shutdown', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const managerAny = manager as unknown as {
        startSlowProbeMode: (server: TargetServer) => void;
        slowProbeTimers: Map<string, ReturnType<typeof setInterval>>;
      };

      // Start slow probe for multiple servers
      managerAny.startSlowProbeMode(testServer);
      managerAny.startSlowProbeMode({ ...testServer, name: 'test-server-2' });

      expect(managerAny.slowProbeTimers.size).toBe(2);

      await manager.shutdown();

      expect(managerAny.slowProbeTimers.size).toBe(0);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('manual disconnect handling', () => {
    it('should stop slow probe mode when manual disconnect is requested', async () => {
      const { connectToServer } = await import('../connection-setup.js');
      const mockConnectToServer = vi.mocked(connectToServer);
      mockConnectToServer.mockRejectedValue(new Error('Connection failed'));

      const managerAny = manager as unknown as {
        startSlowProbeMode: (server: TargetServer) => void;
        slowProbeTimers: Map<string, ReturnType<typeof setInterval>>;
        manualDisconnectRequests: Set<string>;
      };

      managerAny.startSlowProbeMode(testServer);
      expect(managerAny.slowProbeTimers.has('test-server')).toBe(true);

      // Simulate manual disconnect request
      managerAny.manualDisconnectRequests.add('test-server');

      // Fast-forward - probe should detect manual disconnect and stop
      await vi.advanceTimersByTimeAsync(60000);

      expect(managerAny.slowProbeTimers.has('test-server')).toBe(false);
    });
  });
});
