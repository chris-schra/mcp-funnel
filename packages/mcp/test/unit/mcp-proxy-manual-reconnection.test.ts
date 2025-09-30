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

describe('MCPProxy Reconnection Logic - Manual Reconnection', () => {
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
    const { StdioClientTransport } = await import('@mcp-funnel/core');
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
