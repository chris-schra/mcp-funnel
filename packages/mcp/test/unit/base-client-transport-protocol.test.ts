/**
 * Tests for BaseClientTransport - Protocol Version
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
}

describe('BaseClientTransport - Protocol Version', () => {
  let transport: TestTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new TestTransport({
      url: 'https://api.example.com/mcp',
    });
  });

  it('handles protocol version setting', () => {
    expect(() => {
      transport.setProtocolVersion?.('1.0');
    }).not.toThrow();
  });
});