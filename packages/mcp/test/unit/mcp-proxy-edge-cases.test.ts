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

const ensureServerDisconnected = async (proxy: MCPProxy, serverName: string): Promise<void> => {
  const status = proxy.getServerStatus(serverName);
  if (status.status === 'connected') {
    await proxy.disconnectServer(serverName);
  }
};

describe('MCPProxy Reconnection Logic - Edge Cases', () => {
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
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('Server removed')), 1000)),
    );

    await ensureServerDisconnected(mcpProxy, serverName);

    // Start reconnection
    const reconnectPromise = mcpProxy.reconnectServer(serverName);

    // Set up expectation BEFORE advancing timers to avoid unhandled rejection
    const expectation = expect(reconnectPromise).rejects.toThrow('Server removed');

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
