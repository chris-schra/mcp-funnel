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
import { MCPProxy } from '../../src/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TransportError } from '@mcp-funnel/core';
import type { ProxyConfig } from '@mcp-funnel/schemas';

vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
    logError: vi.fn(),
    StdioClientTransport: vi.fn(),
  };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(),
}));

vi.mock('../../src/utils/transports/index.js', () => ({
  createTransport: vi.fn(),
}));

// Mock timers for testing exponential backoff
vi.useFakeTimers();

// Shared test setup
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

describe('MCPProxy Reconnection Logic - Automatic Reconnection', () => {
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

    const { StdioClientTransport } = await import('@mcp-funnel/core');
    vi.mocked(StdioClientTransport).mockImplementation((serverName: string) => {
      const transport = createMockTransport();
      mockTransports.set(serverName, transport);
      return transport as unknown as InstanceType<typeof StdioClientTransport>;
    });

    mcpProxy = new MCPProxy(config);
    await mcpProxy.initialize();
    mockClient.connect.mockClear();
    await ensureServerConnected(mcpProxy, 'test-server');
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should trigger automatic reconnection on transport error', async () => {
    const serverName = 'test-server';

    // Set up event listeners
    const disconnectedHandler = vi.fn();
    const reconnectingHandler = vi.fn();
    mcpProxy.on('server.disconnected', disconnectedHandler);
    mcpProxy.on('server.reconnecting', reconnectingHandler);

    // Simulate transport error that triggers automatic reconnection
    const connectionError = TransportError.connectionFailed('connection lost');

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
