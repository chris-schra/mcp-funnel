/**
 * Tests for BaseClientTransport - Reconnection Manager Integration
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

  protected async sendMessage(_message: JSONRPCMessage): Promise<void> {
    // no-op
  }

  protected async closeConnection(): Promise<void> {
    // no-op
  }

  public testHandleConnectionError(error: Error): void {
    this.handleConnectionError(error);
  }

  public getReconnectionManager() {
    return this.reconnectionManager;
  }
}

describe('BaseClientTransport - Reconnection Manager Integration', () => {
  let transport: TestTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    const config: BaseClientTransportConfig = {
      url: 'https://api.example.com/mcp',
      timeout: 5000,
      reconnect: {
        maxAttempts: 3,
        initialDelayMs: 500,
        backoffMultiplier: 2,
        maxDelayMs: 8000,
      },
    };
    transport = new TestTransport(config);
  });

  it('resets reconnection attempts on successful connection', () => {
    const manager = transport.getReconnectionManager();
    const resetSpy = vi.spyOn(manager, 'reset');

    transport.testHandleConnectionError(new Error('Test error'));
    transport['handleConnectionOpen']();

    expect(resetSpy).toHaveBeenCalled();
  });

  it('schedules reconnection on retryable errors', () => {
    const manager = transport.getReconnectionManager();
    const scheduleSpy = vi.spyOn(manager, 'scheduleReconnection');

    const retryableError = TransportError.connectionFailed('Network error');
    transport.testHandleConnectionError(retryableError);

    expect(scheduleSpy).toHaveBeenCalled();
  });

  it('does not schedule reconnection for non-retryable errors', () => {
    const manager = transport.getReconnectionManager();
    const scheduleSpy = vi.spyOn(manager, 'scheduleReconnection');

    const nonRetryableError = TransportError.authenticationFailed('Auth error');
    transport.testHandleConnectionError(nonRetryableError);

    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it('cancels reconnection on transport close', async () => {
    const manager = transport.getReconnectionManager();
    const cancelSpy = vi.spyOn(manager, 'cancel');

    await transport.close();

    expect(cancelSpy).toHaveBeenCalled();
  });
});
