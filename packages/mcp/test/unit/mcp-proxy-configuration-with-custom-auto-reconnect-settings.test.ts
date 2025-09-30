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

describe('MCPProxy Reconnection Logic - Configuration with Custom Auto-Reconnect Settings', () => {
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
        jitter: 0, // Disable jitter for predictable test timing
      },
    };

    mcpProxy = new MCPProxy(config);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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
