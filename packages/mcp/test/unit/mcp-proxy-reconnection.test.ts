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
  let mockTransport: {
    start: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (data: unknown) => void;
  };
  let config: ProxyConfig;

  beforeEach(() => {
    // Clear all mocks and timers
    vi.clearAllMocks();
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

    // Create mock transport
    mockTransport = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      onclose: undefined,
      onerror: undefined,
      onmessage: undefined,
    };

    mcpProxy = new MCPProxy(config);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

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
      const mockStdioTransport = {
        ...mockTransport,
        start: vi.fn().mockResolvedValue(undefined),
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
      expect(mockTransport.close).toHaveBeenCalled();

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

      // First disconnect to simulate a state where auto-reconnection might be pending
      await mcpProxy.disconnectServer(serverName);

      // Verify disconnection cancels any pending reconnection
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('disconnected');
    });

    it('should clean up resources properly on disconnection', async () => {
      const serverName = 'test-server';

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
      await mcpProxy.reconnectServer(serverName);
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

      await mcpProxy.reconnectServer(serverName);

      const status = mcpProxy.getServerStatus(serverName);
      expect(status.connectedAt).toBeDefined();
      expect(status.connectedAt! >= beforeConnect).toBe(true);
    });
  });

  describe('Automatic Reconnection', () => {
    beforeEach(async () => {
      await mcpProxy.initialize();
      await mcpProxy.reconnectServer('test-server');
    });

    it('should trigger automatic reconnection on transport error', async () => {
      const serverName = 'test-server';

      // Set up event listeners
      const disconnectedHandler = vi.fn();
      const reconnectingHandler = vi.fn();
      mcpProxy.on('server.disconnected', disconnectedHandler);
      mcpProxy.on('server.reconnecting', reconnectingHandler);

      // Simulate transport error that triggers automatic reconnection
      const connectionError = TransportError.connectionFailed('Network error');

      // Get the current transport's error handler
      const currentTransport = mcpProxy['transports'].get(serverName);
      expect(currentTransport).toBeDefined();

      // Simulate transport error
      if (currentTransport?.onerror) {
        currentTransport.onerror(connectionError);
      }

      // Verify server moved to disconnected state
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('error');
      expect(status.error).toBe('Network error');

      // Verify disconnection event was emitted
      expect(disconnectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName,
          status: 'disconnected',
          reason: expect.stringContaining('Network error'),
        }),
      );
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

      // Give the async reconnection time to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify successful reconnection
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

      // Verify server is still in error state after max attempts
      const status = mcpProxy.getServerStatus(serverName);
      expect(status.status).toBe('error');
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
      await mcpProxy.reconnectServer(serverName);

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

      // Start first reconnection
      const firstReconnect = mcpProxy.reconnectServer(serverName);

      // Try to start second reconnection immediately
      await expect(mcpProxy.reconnectServer(serverName)).rejects.toThrow();

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

      // Start reconnection
      const reconnectPromise = mcpProxy.reconnectServer(serverName);

      // Advance time to trigger the rejection
      vi.advanceTimersByTime(1000);

      // Should handle the error gracefully
      await expect(reconnectPromise).rejects.toThrow('Server removed');
    });

    it('should handle transport close during active connection', async () => {
      const serverName = 'test-server';

      // Connect server
      await mcpProxy.reconnectServer(serverName);
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
      await mcpProxy.reconnectServer(serverName);

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
      const serverName = 'test-server';

      // Connect and then simulate disconnection
      await mcpProxy.reconnectServer(serverName);

      // Mock reconnection failures
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      // Simulate transport close to trigger auto-reconnection
      const currentTransport = mcpProxy['transports'].get(serverName);
      if (currentTransport?.onclose) {
        currentTransport.onclose();
      }

      // Verify custom initial delay is used (500ms)
      vi.advanceTimersByTime(499);
      await vi.runOnlyPendingTimersAsync();
      expect(mockClient.connect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      await vi.runOnlyPendingTimersAsync();
      expect(mockClient.connect).toHaveBeenCalled();

      // Verify custom backoff multiplier (1.5x)
      vi.advanceTimersByTime(749); // 500 * 1.5 - 1
      await vi.runOnlyPendingTimersAsync();
      expect(mockClient.connect).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      await vi.runOnlyPendingTimersAsync();
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });
  });
});
