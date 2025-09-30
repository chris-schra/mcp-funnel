/**
 * Tests for BaseClientTransport - Authentication Integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BaseClientTransport,
  TransportError,
  type IAuthProvider,
  type BaseClientTransportConfig,
} from '@mcp-funnel/core';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { createMockAuthProvider } from './test-utils.js';

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
  public sendMessageCalls: JSONRPCMessage[] = [];

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
    this.sendMessageCalls.push(message);
  }

  protected async closeConnection(): Promise<void> {
    // no-op
  }
}

describe('BaseClientTransport - Authentication Integration', () => {
  let mockAuthProvider: IAuthProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthProvider = createMockAuthProvider();
  });

  it('includes auth headers when auth provider is configured', async () => {
    const transport = new TestTransport({
      url: 'https://api.example.com/mcp',
      authProvider: mockAuthProvider,
    });

    const headers = await transport['getAuthHeaders']();
    expect(mockAuthProvider.getHeaders).toHaveBeenCalled();
    expect(headers).toEqual({
      Authorization: 'Bearer mock-token',
    });
  });

  it('returns empty headers when no auth provider', async () => {
    const noAuthTransport = new TestTransport({ url: 'https://example.com' });
    const headers = await noAuthTransport['getAuthHeaders']();
    expect(headers).toEqual({});
  });

  it('handles auth provider errors gracefully', async () => {
    const authError = new Error('Auth failed');
    vi.mocked(mockAuthProvider.getHeaders).mockRejectedValue(authError);

    const transport = new TestTransport({
      url: 'https://api.example.com/mcp',
      authProvider: mockAuthProvider,
    });

    await expect(transport['getAuthHeaders']()).rejects.toThrow(TransportError);
  });
});
