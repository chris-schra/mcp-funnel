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

describe('MCPProxy Reconnection Logic - Configuration with Auto-Reconnect Disabled', () => {
  beforeEach(async () => {
    // Clear all mocks and reset to fake timers for deterministic scheduling
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.clearAllTimers();

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
        jitter: 0,
      },
    };

    mcpProxy = new MCPProxy(config);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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
