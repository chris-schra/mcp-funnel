/**
 * Tests for BaseClientTransport - Event Callbacks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  JSONRPCResponse,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';
import {
  BaseClientTransport,
  type BaseClientTransportConfig,
  TransportError,
} from '@mcp-funnel/core';

// Mock logger module
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

// Test implementation of BaseClientTransport for testing
class TestTransport extends BaseClientTransport {
  constructor(config: BaseClientTransportConfig) {
    super(config, 'test-transport');
  }

  protected validateAndNormalizeUrl(config: BaseClientTransportConfig): void {
    if (!config.url || !config.url.startsWith('http')) {
      throw new Error('Invalid URL');
    }
  }

  protected async connect(): Promise<void> {
    this.handleConnectionOpen();
  }

  protected async sendMessage(_message: JSONRPCMessage): Promise<void> {
    // no-op
  }

  protected async closeConnection(): Promise<void> {
    // no-op
  }

  public testHandleMessage(message: JSONRPCMessage): void {
    this.handleMessage(message);
  }

  public testHandleConnectionError(error: Error): void {
    this.handleConnectionError(error);
  }
}

describe('BaseClientTransport - Event Callbacks', () => {
  let transport: TestTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new TestTransport({
      url: 'https://api.example.com/mcp',
    });
  });

  it('calls onmessage callback when message received', () => {
    const onmessageSpy = vi.fn();
    transport.onmessage = onmessageSpy;

    const message: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: 'test-id',
      result: { success: true },
    };

    transport.testHandleMessage(message);
    expect(onmessageSpy).toHaveBeenCalledWith(message);
  });

  it('calls onerror callback on connection error', () => {
    const onerrorSpy = vi.fn();
    transport.onerror = onerrorSpy;

    const error = new Error('Test error');
    transport.testHandleConnectionError(error);

    expect(onerrorSpy).toHaveBeenCalledWith(expect.any(TransportError));
  });

  it('calls onclose callback when transport closes', async () => {
    const oncloseSpy = vi.fn();
    transport.onclose = oncloseSpy;

    await transport.close();
    expect(oncloseSpy).toHaveBeenCalled();
  });
});
