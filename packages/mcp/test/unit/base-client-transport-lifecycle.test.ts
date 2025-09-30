/**
 * Tests for BaseClientTransport - Lifecycle Management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  JSONRPCRequest,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';
import {
  BaseClientTransport,
  type BaseClientTransportConfig,
  type PendingRequest,
} from '@mcp-funnel/core';

// Mock logger module
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

// Mock UUID module
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

// Test implementation of BaseClientTransport for testing
class TestTransport extends BaseClientTransport {
  public connectCalls = 0;
  public closeCalls = 0;

  constructor(config: BaseClientTransportConfig) {
    super(config, 'test-transport');
  }

  protected validateAndNormalizeUrl(config: BaseClientTransportConfig): void {
    if (!config.url || !config.url.startsWith('http')) {
      throw new Error('Invalid URL');
    }
  }

  protected async connect(): Promise<void> {
    this.connectCalls++;
    this.handleConnectionOpen();
  }

  protected async sendMessage(_message: JSONRPCMessage): Promise<void> {
    // no-op
  }

  protected async closeConnection(): Promise<void> {
    this.closeCalls++;
  }

  public getPendingRequests(): Map<string, PendingRequest> {
    return this.pendingRequests;
  }
}

describe('BaseClientTransport - Lifecycle Management', () => {
  let transport: TestTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    const config: BaseClientTransportConfig = {
      url: 'https://api.example.com/mcp',
    };
    transport = new TestTransport(config);
  });

  it('starts transport and establishes connection', async () => {
    expect(transport['isStarted']).toBe(false);

    await transport.start();

    expect(transport['isStarted']).toBe(true);
    expect(transport.connectCalls).toBe(1);
  });

  it('prevents multiple starts', async () => {
    await transport.start();
    await transport.start(); // Second call should be no-op

    expect(transport.connectCalls).toBe(1);
  });

  it('closes transport and cleans up resources', async () => {
    await transport.start();

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const sendPromise = transport.send(request);
    expect(transport.getPendingRequests().size).toBe(1);

    await transport.close();

    await expect(sendPromise).rejects.toThrow('Transport closed');

    expect(transport['isClosed']).toBe(true);
    expect(transport['isStarted']).toBe(false);
    expect(transport.closeCalls).toBe(1);
    expect(transport.getPendingRequests().size).toBe(0);
  });

  it('prevents operations on closed transport', async () => {
    await transport.close();

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    await expect(transport.send(request)).rejects.toThrow(
      'Transport is closed',
    );
  });

  it('generates session ID on connection', async () => {
    await transport.start();
    expect(transport.sessionId).toBe('mock-uuid-1234');
  });
});
