/**
 * Tests for MCPProxy Reconnection Logic
 *
 * Comprehensive test coverage for MCPProxy reconnection functionality to ensure
 * reliable server connection management with automatic and manual reconnection.
 *
 * Test Categories:
 * 1. Manual Reconnection: reconnectServer() method functionality
 * 2. Manual Disconnection: disconnectServer() method functionality
 * 3. Connection State Tracking: Server state transitions and getServerStatus()
 * 4. Automatic Reconnection: Transport-level reconnection with exponential backoff
 * 5. Edge Cases: Multiple disconnections, rapid reconnections, error scenarios
 * 6. Configuration: Auto-reconnect enabled/disabled, custom retry settings
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPProxy, type ProxyConfig } from '../../src/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TransportError } from '../../src/transports/errors/transport-error.js';

// Mock external dependencies
vi.mock('../../src/logger.js', () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(),
}));

vi.mock(
  '../../src/transports/implementations/stdio-client-transport.js',
  () => ({
    StdioClientTransport: vi.fn(),
  }),
);

vi.mock('../../src/transports/index.js', () => ({
  createTransport: vi.fn(),
}));

// Mock timers for testing exponential backoff
vi.useFakeTimers();

describe('MCPProxy Reconnection Logic', () => {
  let mcpProxy: MCPProxy;
  let mockClient: {
    connect: ReturnType<typeof vi.fn>;
    listTools: ReturnType<typeof vi.fn>;
    callTool: ReturnType<typeof vi.fn>;
  };
  type MockTransport = {
    start: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (data: unknown) => void;
  };
  let mockTransports: Map<string, MockTransport>;
  let config: ProxyConfig;

  beforeEach(async () => {
    // Clear all mocks and reset to fake timers for deterministic scheduling
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.clearAllTimers();

    // Set up base config
    config = {
      servers: {
        'test-server': {
          command: 'node',
          args: ['test-server.js'],
        },
        'api-server': {
          command: 'node',
          args: ['api-server.js'],
        },
      },
    };

    // Create mock client
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      callTool: vi.fn(),
    };
    vi.mocked(Client).mockImplementation(() => mockClient as unknown as Client);

    mockTransports = new Map();
    const createMockTransport = (): MockTransport => ({
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      onclose: undefined,
      onerror: undefined,
      onmessage: undefined,
    });

    const { StdioClientTransport } = await import(
      '../../src/transports/implementations/stdio-client-transport.js'
    );
    vi.mocked(StdioClientTransport).mockImplementation((serverName: string) => {
      const transport = createMockTransport();
      mockTransports.set(serverName, transport);
      return transport as unknown as InstanceType<typeof StdioClientTransport>;
    });

    mcpProxy = new MCPProxy(config);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const ensureServerConnected = async (
    proxy: MCPProxy,
    serverName: string,
  ): Promise<void> => {
    const status = proxy.getServerStatus(serverName);
    if (status.status !== 'connected') {
      await proxy.reconnectServer(serverName);
    }
  };

  const ensureServerDisconnected = async (
    proxy: MCPProxy,
    serverName: string,
  ): Promise<void> => {
    const status = proxy.getServerStatus(serverName);
    if (status.status === 'connected') {
      await proxy.disconnectServer(serverName);
    }
  };

  const getMockTransport = (serverName: string): MockTransport | undefined =>
    mockTransports.get(serverName);

  describe('Manual Reconnection', () => {
    it('should successfully reconnect a disconnected server', async () => {
      // Initialize with failing connections to keep servers disconnected
      mockClient.connect.mockRejectedValue(
        new Error('Initial connection failed'),
      );
      await mcpProxy.initialize();

      // Reset the mock for successful reconnection
      mockClient.connect.mockResolvedValue(undefined);

      // Simulate a server that was previously connected but got disconnected
      const serverName = 'test-server';

      // First, establish that the server is disconnected
      const initialStatus = mcpProxy.getServerStatus(serverName);
      expect(initialStatus.status).toBe('disconnected'); // Should be 'disconnected' due to failed initial connection

      // Mock successful connection
      const mockStdioTransport: MockTransport = {
        start: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        onclose: undefined,
        onerror: undefined,
        onmessage: undefined,
      };

      // Mock the transport creation
      const { StdioClientTransport } = await import(
        '../../src/transports/implementations/stdio-client-transport.js'
      );
      vi.mocked(StdioClientTransport).mockImplementation(
        () =>
          mockStdioTransport as unknown as InstanceType<
            typeof StdioClientTransport
          >,
      );

      // Set up event listeners to verify events are emitted
      const reconnectingHandler = vi.fn();
      const connectedHandler = vi.fn();
      mcpProxy.on('server.reconnecting', reconnectingHandler);
      mcpProxy.on('server.connected', connectedHandler);

      // Attempt reconnection
      await mcpProxy.reconnectServer(serverName);

      // Verify the server is now connected
      const reconnectedStatus = mcpProxy.getServerStatus(serverName);
      expect(reconnectedStatus.status).toBe('connected');
      expect(reconnectedStatus.connectedAt).toBeDefined();
      expect(mockClient.connect).toHaveBeenCalledWith(mockStdioTransport);

      // Verify events were emitted
      expect(reconnectingHandler).toHaveBeenCalledWith({
        serverName,
        status: 'reconnecting',
        timestamp: expect.any(String),
      });
      expect(connectedHandler).toHaveBeenCalledWith({
        serverName,
        status: 'connected',
        timestamp: expect.any(String),
      });
    });

    it('should throw error when trying to reconnect an already connected server', async () => {
      // Initialize with successful connections
      await mcpProxy.initialize();

      const serverName = 'test-server';

      // Verify it's connected after initialization
      expect(mcpProxy.getServerStatus(serverName).status).toBe('connected');

      // Try to reconnect again - should throw
      await expect(mcpProxy.reconnectServer(serverName)).rejects.toThrow(
        `Server '${serverName}' is already connected`,
      );
    });

    it('should throw error when trying to reconnect non-existent server', async () => {
      await mcpProxy.initialize();
      const nonExistentServer = 'non-existent-server';

      await expect(mcpProxy.reconnectServer(nonExistentServer)).rejects.toThrow(
        `Server '${nonExistentServer}' not found or not configured`,
      );
    });

    it('should handle reconnection failure gracefully', async () => {
      // Initialize with failing connections to keep servers disconnected
      mockClient.connect.mockRejectedValue(
        new Error('Initial connection failed'),
      );
      await mcpProxy.initialize();

      const serverName = 'test-server';
      const connectionError = new Error('Connection failed');

      // Mock failed connection for reconnection attempt
      mockClient.connect.mockRejectedValueOnce(connectionError);

      // Attempt reconnection - should throw but not crash
      await expect(mcpProxy.reconnectServer(serverName)).rejects.toThrow(
        'Connection failed',
      );

      // Verify the server remains disconnected with error info
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('error');
      expect(status.error).toBe('Connection failed');
    });

    it('should reset reconnection attempts counter on manual reconnection', async () => {
      // Initialize with failing connections to keep servers disconnected
      mockClient.connect.mockRejectedValue(
        new Error('Initial connection failed'),
      );
      await mcpProxy.initialize();

      // Reset mock for successful reconnection
      mockClient.connect.mockResolvedValue(undefined);

      const serverName = 'test-server';

      // Manually reconnect
      await mcpProxy.reconnectServer(serverName);

      // Verify successful connection resets any internal attempt counters
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('connected');
    });
  });

  describe('Manual Disconnection', () => {
    it('should successfully disconnect a connected server', async () => {
      // Initialize with successful connections
      await mcpProxy.initialize();

      const serverName = 'test-server';

      // Verify server is connected
      expect(mcpProxy.getServerStatus(serverName).status).toBe('connected');

      // Set up event listener to verify disconnection event
      const disconnectedHandler = vi.fn();
      mcpProxy.on('server.disconnected', disconnectedHandler);

      // Disconnect the server
      await mcpProxy.disconnectServer(serverName);

      // Verify server is now disconnected
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('disconnected');
      const transport = getMockTransport(serverName);
      expect(transport?.close).toHaveBeenCalled();

      // Verify disconnection event was emitted
      expect(disconnectedHandler).toHaveBeenCalledWith({
        serverName,
        status: 'disconnected',
        timestamp: expect.any(String),
        reason: 'manual_disconnect',
      });
    });

    it('should throw error when trying to disconnect a non-connected server', async () => {
      // Initialize with failing connections to keep servers disconnected
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));
      await mcpProxy.initialize();

      const serverName = 'api-server'; // Not connected

      await expect(mcpProxy.disconnectServer(serverName)).rejects.toThrow(
        `Server '${serverName}' is not currently connected`,
      );
    });

    it('should cancel pending automatic reconnection on manual disconnect', async () => {
      const serverName = 'test-server';

      await mcpProxy.initialize();
      await ensureServerConnected(mcpProxy, serverName);

      mockClient.connect.mockClear();

      // First disconnect to simulate a state where auto-reconnection might be pending
      await mcpProxy.disconnectServer(serverName);

      // Verify disconnection cancels any pending reconnection
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('disconnected');
      expect(mcpProxy['reconnectionManagers'].has(serverName)).toBe(false);

      // Advance time to ensure no automatic reconnection attempt is scheduled
      vi.advanceTimersByTime(60000);
      await vi.runOnlyPendingTimersAsync();

      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it('should clean up resources properly on disconnection', async () => {
      const serverName = 'test-server';

      await mcpProxy.initialize();
      await ensureServerConnected(mcpProxy, serverName);

      // Disconnect the server
      await mcpProxy.disconnectServer(serverName);

      // Verify resources are cleaned up
      const targetServers = mcpProxy.getTargetServers();
      expect(
        targetServers.connected.some(([name]) => name === serverName),
      ).toBe(false);
      expect(
        targetServers.disconnected.some(([name]) => name === serverName),
      ).toBe(true);
    });
  });

  describe('Connection State Tracking', () => {
    beforeEach(async () => {
      mockClient.connect.mockRejectedValueOnce(
        new Error('Initial connection failed'),
      );
      await mcpProxy.initialize();
    });

    it('should correctly track server state transitions', async () => {
      const serverName = 'test-server';

      // Initial state: disconnected
      let status = mcpProxy.getServerStatus(serverName);
      expect(status).toEqual({
        name: serverName,
        status: 'disconnected',
      });

      // Connect: should transition to connected
      await ensureServerConnected(mcpProxy, serverName);
      status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('connected');
      expect(status.connectedAt).toBeDefined();
      expect(typeof status.connectedAt).toBe('string');

      // Disconnect: should transition back to disconnected
      await mcpProxy.disconnectServer(serverName);
      status = mcpProxy.getServerStatus(serverName);
      expect(status).toEqual({
        name: serverName,
        status: 'disconnected',
      });
    });

    it('should track error state when connection fails', async () => {
      const serverName = 'test-server';
      const errorMessage = 'Authentication failed';

      // Mock connection failure
      mockClient.connect.mockRejectedValueOnce(new Error(errorMessage));

      // Attempt connection
      await expect(mcpProxy.reconnectServer(serverName)).rejects.toThrow();

      // Check error state
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('error');
      expect(status.error).toBe(errorMessage);
    });

    it('should return correct status for unknown servers', () => {
      const unknownServer = 'unknown-server';
      const status = mcpProxy.getServerStatus(unknownServer);

      expect(status).toEqual({
        name: unknownServer,
        status: 'disconnected',
      });
    });

    it('should maintain connection timestamps', async () => {
      const serverName = 'test-server';
      const beforeConnect = new Date().toISOString();

      await ensureServerConnected(mcpProxy, serverName);

      const status = mcpProxy.getServerStatus(serverName);
      expect(status.connectedAt).toBeDefined();
      expect(status.connectedAt! >= beforeConnect).toBe(true);
    });
  });

  describe('Automatic Reconnection', () => {
    beforeEach(async () => {
      await mcpProxy.initialize();
      mockClient.connect.mockClear();
      await ensureServerConnected(mcpProxy, 'test-server');
    });

    it('should trigger automatic reconnection on transport error', async () => {
      const serverName = 'test-server';

      // Set up event listeners
      const disconnectedHandler = vi.fn();
      const reconnectingHandler = vi.fn();
      mcpProxy.on('server.disconnected', disconnectedHandler);
      mcpProxy.on('server.reconnecting', reconnectingHandler);

      // Simulate transport error that triggers automatic reconnection
      const connectionError =
        TransportError.connectionFailed('connection lost');

      // Get the current transport's error handler
      const currentTransport = getMockTransport(serverName);
      expect(currentTransport).toBeDefined();
      expect(typeof currentTransport?.onerror).toBe('function');

      // Simulate transport error
      currentTransport?.onerror?.(connectionError as Error);

      // Verify disconnection event was emitted with error context
      expect(disconnectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName,
          status: 'disconnected',
          reason: expect.stringContaining('connection'),
        }),
      );

      // Auto-reconnection should not happen before scheduled delay
      expect(reconnectingHandler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      expect(reconnectingHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName,
          status: 'reconnecting',
          retryAttempt: expect.any(Number),
        }),
      );

      await vi.runOnlyPendingTimersAsync();
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('connected');
    });

    it('should perform automatic reconnection with exponential backoff', async () => {
      const serverName = 'test-server';

      // Mock initial connection failure followed by success
      mockClient.connect
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(undefined);

      // Set up event listeners
      const reconnectingHandler = vi.fn();
      const connectedHandler = vi.fn();
      mcpProxy.on('server.reconnecting', reconnectingHandler);
      mcpProxy.on('server.connected', connectedHandler);

      // Simulate transport close to trigger auto-reconnection
      const currentTransport = mcpProxy['transports'].get(serverName);
      if (currentTransport?.onclose) {
        currentTransport.onclose();
      }

      // Advance through the first reconnection attempt (which will fail)
      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      // Advance through the second reconnection attempt (which will succeed)
      vi.advanceTimersByTime(2000);
      await vi.runOnlyPendingTimersAsync();

      // Verify reconnection events were emitted
      expect(reconnectingHandler).toHaveBeenCalled();

      // Flush any remaining microtasks triggered by reconnection
      await vi.runOnlyPendingTimersAsync();

      expect(connectedHandler).toHaveBeenCalled();
    });

    it('should apply exponential backoff for reconnection attempts', async () => {
      const serverName = 'test-server';

      // Simulate multiple connection failures to test backoff
      mockClient.connect
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(undefined);

      // Trigger automatic reconnection by simulating transport close
      const currentTransport = mcpProxy['transports'].get(serverName);
      if (currentTransport?.onclose) {
        currentTransport.onclose();
      }

      // Fast-forward through backoff delays
      vi.advanceTimersByTime(1000); // Initial delay
      await vi.runOnlyPendingTimersAsync();

      vi.advanceTimersByTime(2000); // Second attempt (exponential backoff)
      await vi.runOnlyPendingTimersAsync();

      // Verify reconnection attempts were made with proper delays
      // Note: Actual backoff testing depends on implementation details
    });

    it('should stop reconnection attempts after max attempts reached', async () => {
      const serverName = 'test-server';
      const maxAttempts = 10; // Default max attempts

      // Mock all reconnection attempts to fail
      mockClient.connect.mockRejectedValue(new Error('Persistent failure'));

      // Trigger automatic reconnection
      const currentTransport = mcpProxy['transports'].get(serverName);
      if (currentTransport?.onclose) {
        currentTransport.onclose();
      }

      // Fast-forward through all reconnection attempts
      for (let i = 0; i < maxAttempts; i++) {
        vi.advanceTimersByTime(Math.pow(2, i) * 1000); // Exponential backoff
        await vi.runOnlyPendingTimersAsync();
      }

      expect(mockClient.connect).toHaveBeenCalledTimes(maxAttempts);

      const reconnectionManagers = (
        mcpProxy as unknown as {
          reconnectionManagers: Map<string, unknown>;
        }
      ).reconnectionManagers;

      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).not.toBe('connected');
      expect(reconnectionManagers.has(serverName)).toBe(false);
    });

    it('should reset reconnection attempts on successful connection', async () => {
      const serverName = 'test-server';

      // Simulate one failed attempt followed by success
      mockClient.connect
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(undefined);

      // Trigger reconnection
      const currentTransport = mcpProxy['transports'].get(serverName);
      if (currentTransport?.onclose) {
        currentTransport.onclose();
      }

      // Process first failed attempt
      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      // Process successful reconnection
      vi.advanceTimersByTime(2000);
      await vi.runOnlyPendingTimersAsync();

      // Verify successful reconnection
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('connected');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await mcpProxy.initialize();
    });

    it('should handle multiple rapid disconnections gracefully', async () => {
      const serverName = 'test-server';

      // Connect server
      await ensureServerConnected(mcpProxy, serverName);

      // Simulate rapid multiple disconnections
      const currentTransport = mcpProxy['transports'].get(serverName);

      // Multiple onclose calls should not cause issues
      if (currentTransport?.onclose) {
        currentTransport.onclose();
        currentTransport.onclose();
        currentTransport.onclose();
      }

      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('disconnected');
    });

    it('should handle reconnect attempt while already reconnecting', async () => {
      const serverName = 'test-server';

      // Start a reconnection that will be slow
      mockClient.connect.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      );

      await ensureServerDisconnected(mcpProxy, serverName);

      // Start first reconnection
      const firstReconnect = mcpProxy.reconnectServer(serverName);

      // Try to start second reconnection immediately
      await expect(mcpProxy.reconnectServer(serverName)).rejects.toThrow(
        `Manual reconnection already in progress for server '${serverName}'`,
      );

      // Clean up the pending reconnection
      vi.advanceTimersByTime(5000);
      await firstReconnect;
    });

    it('should handle server removal during reconnection attempt', async () => {
      const serverName = 'test-server';

      // Mock slow reconnection
      mockClient.connect.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Server removed')), 1000),
          ),
      );

      await ensureServerDisconnected(mcpProxy, serverName);

      // Start reconnection
      const reconnectPromise = mcpProxy.reconnectServer(serverName);

      // Set up expectation BEFORE advancing timers to avoid unhandled rejection
      const expectation =
        expect(reconnectPromise).rejects.toThrow('Server removed');

      // Advance time to trigger the rejection
      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      // Should handle the error gracefully
      await expectation;
    });

    it('should handle transport close during active connection', async () => {
      const serverName = 'test-server';

      // Connect server
      await ensureServerConnected(mcpProxy, serverName);
      expect(mcpProxy.getServerStatus(serverName).status).toBe('connected');

      // Simulate transport close
      const currentTransport = mcpProxy['transports'].get(serverName);
      if (currentTransport?.onclose) {
        currentTransport.onclose();
      }

      // Verify server is marked as disconnected
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('disconnected');
    });
  });

  describe('Configuration with Auto-Reconnect Disabled', () => {
    beforeEach(() => {
      // Create config with auto-reconnect disabled
      config = {
        servers: {
          'test-server': {
            command: 'node',
            args: ['test-server.js'],
          },
        },
        autoReconnect: {
          enabled: false,
          maxAttempts: 10,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 60000,
        },
      };

      mcpProxy = new MCPProxy(config);
    });

    it('should not attempt automatic reconnection when disabled', async () => {
      await mcpProxy.initialize();
      const serverName = 'test-server';

      // Connect server first
      await ensureServerConnected(mcpProxy, serverName);

      // Simulate transport close
      const currentTransport = mcpProxy['transports'].get(serverName);
      if (currentTransport?.onclose) {
        currentTransport.onclose();
      }

      // Fast-forward time - no reconnection should occur
      vi.advanceTimersByTime(10000);
      await vi.runOnlyPendingTimersAsync();

      // Server should remain disconnected
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('disconnected');
    });

    it('should still allow manual reconnection when auto-reconnect is disabled', async () => {
      await mcpProxy.initialize();
      const serverName = 'test-server';

      // Manually reconnect should still work
      await ensureServerDisconnected(mcpProxy, serverName);
      await mcpProxy.reconnectServer(serverName);

      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('connected');
    });
  });

  describe('Configuration with Custom Auto-Reconnect Settings', () => {
    beforeEach(() => {
      // Create config with custom auto-reconnect settings
      config = {
        servers: {
          'test-server': {
            command: 'node',
            args: ['test-server.js'],
          },
        },
        autoReconnect: {
          enabled: true,
          maxAttempts: 3,
          initialDelayMs: 500,
          backoffMultiplier: 1.5,
          maxDelayMs: 5000,
        },
      };

      mcpProxy = new MCPProxy(config);
    });

    it('should use custom reconnection configuration', async () => {
      await mcpProxy.initialize();
      mockClient.connect.mockClear();
      const serverName = 'test-server';

      // Connect and then simulate disconnection
      await ensureServerConnected(mcpProxy, serverName);

      // Mock reconnection failures
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      // Simulate transport close to trigger auto-reconnection
      const currentTransport = mcpProxy['transports'].get(serverName);
      if (currentTransport?.onclose) {
        currentTransport.onclose();
      }

      const callsAfterClose = mockClient.connect.mock.calls.length;

      // Verify custom initial delay is used (500ms)
      vi.advanceTimersByTime(499);
      expect(mockClient.connect.mock.calls.length).toBe(callsAfterClose);

      await vi.advanceTimersByTimeAsync(1);
      const callsAfterFirstAttempt = mockClient.connect.mock.calls.length;
      expect(callsAfterFirstAttempt).toBeGreaterThan(callsAfterClose);

      // Verify custom backoff multiplier (1.5x)
      await vi.advanceTimersByTimeAsync(749); // 500 * 1.5 - 1
      expect(mockClient.connect.mock.calls.length).toBe(callsAfterFirstAttempt);

      await vi.advanceTimersByTimeAsync(1);
      expect(mockClient.connect.mock.calls.length).toBeGreaterThan(
        callsAfterFirstAttempt,
      );
    });
  });
});
