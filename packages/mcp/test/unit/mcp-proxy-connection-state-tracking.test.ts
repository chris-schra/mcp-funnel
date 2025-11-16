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

const ensureServerConnected = async (proxy: MCPProxy, serverName: string): Promise<void> => {
  const status = proxy.getServerStatus(serverName);
  if (status.status !== 'connected') {
    await proxy.reconnectServer(serverName);
  }
};

describe('MCPProxy Reconnection Logic - Connection State Tracking', () => {
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
    mockClient.connect.mockRejectedValueOnce(new Error('Initial connection failed'));
    await mcpProxy.initialize();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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
