/**
 * Tests for BaseClientTransport - HTTP Request Handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { JSONRPCRequest, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  BaseClientTransport,
  type BaseClientTransportConfig,
  type IAuthProvider,
  TransportError,
} from '@mcp-funnel/core';
import { createMockAuthProvider } from './test-utils.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

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

  public testExecuteHttpRequest(message: JSONRPCMessage, signal: AbortSignal): Promise<void> {
    return this.executeHttpRequest(message, signal);
  }
}

describe('BaseClientTransport - HTTP Request Handling', () => {
  let transport: TestTransport;
  let mockAuthProvider: IAuthProvider;
  let config: BaseClientTransportConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthProvider = createMockAuthProvider();

    config = {
      url: 'https://api.example.com/mcp',
      timeout: 5000,
      authProvider: mockAuthProvider,
    };

    transport = new TestTransport(config);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  it('includes Content-Type header in HTTP requests', async () => {
    const message: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const controller = new AbortController();
    await transport.testExecuteHttpRequest(message, controller.signal);

    expect(mockFetch).toHaveBeenCalledWith(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-token',
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
  });

  it('handles 401 responses with token refresh', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    const message: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const controller = new AbortController();
    await transport.testExecuteHttpRequest(message, controller.signal);

    expect(mockAuthProvider.refresh).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('handles token refresh failure on 401', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    vi.mocked(mockAuthProvider.refresh!).mockRejectedValue(new Error('Refresh failed'));

    const message: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const controller = new AbortController();

    await expect(transport.testExecuteHttpRequest(message, controller.signal)).rejects.toThrow(
      TransportError,
    );
  });

  it('handles non-401 HTTP errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const message: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const controller = new AbortController();

    await expect(transport.testExecuteHttpRequest(message, controller.signal)).rejects.toThrow(
      TransportError,
    );
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const message: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const controller = new AbortController();

    await expect(transport.testExecuteHttpRequest(message, controller.signal)).rejects.toThrow(
      TransportError,
    );
  });

  it('handles request timeout', async () => {
    const abortError = new Error('Request timeout');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    const message: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const controller = new AbortController();

    await expect(transport.testExecuteHttpRequest(message, controller.signal)).rejects.toThrow(
      TransportError,
    );
  });
});
