/**
 * Tests for BaseClientTransport - Message Parsing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  BaseClientTransport,
  type BaseClientTransportConfig,
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

  protected async sendMessage(message: JSONRPCMessage): Promise<void> {
    // no-op
  }

  protected async closeConnection(): Promise<void> {
    // no-op
  }

  public testParseMessage(data: string): JSONRPCMessage {
    return this.parseMessage(data);
  }
}

describe('BaseClientTransport - Message Parsing', () => {
  let transport: TestTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new TestTransport({
      url: 'https://api.example.com/mcp',
    });
  });

  it('parses valid JSON-RPC messages', () => {
    const validMessage = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const parsed = transport.testParseMessage(JSON.stringify(validMessage));
    expect(parsed).toEqual(validMessage);
  });

  it('rejects invalid JSON', () => {
    expect(() => {
      transport.testParseMessage('invalid json');
    }).toThrow('Failed to parse message');
  });

  it('rejects messages without jsonrpc version', () => {
    const invalidMessage = {
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    expect(() => {
      transport.testParseMessage(JSON.stringify(invalidMessage));
    }).toThrow('Invalid JSON-RPC format');
  });

  it('rejects messages with wrong jsonrpc version', () => {
    const invalidMessage = {
      jsonrpc: '1.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    expect(() => {
      transport.testParseMessage(JSON.stringify(invalidMessage));
    }).toThrow('Invalid JSON-RPC format');
  });
});
