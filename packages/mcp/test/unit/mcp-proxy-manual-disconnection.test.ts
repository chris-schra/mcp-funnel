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

describe('MCPProxy Reconnection Logic - Manual Disconnection', () => {
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
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

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
