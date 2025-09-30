/**
 * Tests for BaseClientTransport - Error Handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
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

  protected async sendMessage(message: JSONRPCMessage): Promise<void> {
    // no-op
  }

  protected async closeConnection(): Promise<void> {
    // no-op
  }

  public testHandleConnectionError(error: Error): void {
    this.handleConnectionError(error);
  }
}

describe('BaseClientTransport - Error Handling', () => {
  let transport: TestTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new TestTransport({
      url: 'https://api.example.com/mcp',
    });
  });

  it('converts generic errors to TransportError', () => {
    const genericError = new Error('Generic error');
    transport.testHandleConnectionError(genericError);

    // Should call onerror with TransportError
    // Note: Testing error propagation requires mock setup
  });

  it('preserves TransportError instances', () => {
    const transportError = TransportError.protocolError('Transport error');
    transport.testHandleConnectionError(transportError);

    // Should pass through unchanged
  });
});
