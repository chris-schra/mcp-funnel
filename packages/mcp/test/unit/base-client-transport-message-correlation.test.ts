/**
 * Tests for BaseClientTransport - Message Correlation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
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

  public testHandleMessage(message: JSONRPCMessage): void {
    this.handleMessage(message);
  }

  public getPendingRequests(): Map<string, PendingRequest> {
    return this.pendingRequests;
  }
}

describe('BaseClientTransport - Message Correlation', () => {
  let transport: TestTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new TestTransport({
      url: 'https://api.example.com/mcp',
      timeout: 5000,
    });
  });

  it('generates request ID when not present', async () => {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: '',
      method: 'test/method',
      params: {},
    };

    const sendPromise = transport.send(request);

    expect(request.id).toMatch(/^\d{13}_[a-f0-9]{8}$/);
    expect(transport.sendMessageCalls).toHaveLength(1);
    expect(transport.sendMessageCalls[0]).toBe(request);

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result: { success: true },
    };
    transport.testHandleMessage(response);

    await expect(sendPromise).resolves.toBeUndefined();
  });

  it('preserves existing request ID', async () => {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'existing-id',
      method: 'test/method',
      params: {},
    };

    const sendPromise = transport.send(request);

    expect(request.id).toBe('existing-id');

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: 'existing-id',
      result: { success: true },
    };
    transport.testHandleMessage(response);

    await expect(sendPromise).resolves.toBeUndefined();
  });

  it('tracks pending requests for correlation', async () => {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const sendPromise = transport.send(request);

    const pendingRequests = transport.getPendingRequests();
    expect(pendingRequests.has('test-id')).toBe(true);

    const pending = pendingRequests.get('test-id');
    expect(pending).toBeDefined();
    expect(pending!.timestamp).toBeCloseTo(Date.now(), -2);

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: 'test-id',
      result: { success: true },
    };
    transport.testHandleMessage(response);

    await expect(sendPromise).resolves.toBeUndefined();
  });

  it('cleans up pending requests on response', async () => {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test/method',
      params: {},
    };

    const sendPromise = transport.send(request);
    expect(transport.getPendingRequests().has('test-id')).toBe(true);

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: 'test-id',
      result: { success: true },
    };

    transport.testHandleMessage(response);

    await expect(sendPromise).resolves.toBeUndefined();
    expect(transport.getPendingRequests().has('test-id')).toBe(false);
  });

  it('sends non-request messages directly without correlation', async () => {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: 'response-id',
      result: { value: 'test-result' },
    };

    await transport.send(response);

    expect(transport.sendMessageCalls).toHaveLength(1);
    expect(transport.sendMessageCalls[0]).toBe(response);
    expect(transport.getPendingRequests().size).toBe(0);
  });

  it('resolves promise when successful response is received', async () => {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'success-test',
      method: 'test/method',
      params: { data: 'test' },
    };

    const sendPromise = transport.send(request);

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: 'success-test',
      result: { success: true, data: 'response-data' },
    };

    transport.testHandleMessage(response);

    await expect(sendPromise).resolves.toBeUndefined();
    expect(transport.getPendingRequests().has('success-test')).toBe(false);
  });

  it('rejects promise when error response is received', async () => {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'error-test',
      method: 'test/method',
      params: {},
    };

    const sendPromise = transport.send(request);

    const errorResponse = {
      jsonrpc: '2.0' as const,
      id: 'error-test',
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    };

    transport.testHandleMessage(errorResponse);

    await expect(sendPromise).rejects.toThrow('JSON-RPC error -32600: Invalid Request');
    expect(transport.getPendingRequests().has('error-test')).toBe(false);
  });

  it('rejects promise on request timeout', async () => {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'timeout-test',
      method: 'test/method',
      params: {},
    };

    const shortTimeoutTransport = new TestTransport({
      url: 'https://example.com',
      timeout: 100,
    });

    const sendPromise = shortTimeoutTransport.send(request);

    await expect(sendPromise).rejects.toThrow('Request timeout after 100ms');
    expect(shortTimeoutTransport.getPendingRequests().has('timeout-test')).toBe(false);
  });

  it('handles multiple concurrent requests correctly', async () => {
    const requests = [
      {
        jsonrpc: '2.0' as const,
        id: 'req-1',
        method: 'test/method1',
        params: {},
      },
      {
        jsonrpc: '2.0' as const,
        id: 'req-2',
        method: 'test/method2',
        params: {},
      },
      {
        jsonrpc: '2.0' as const,
        id: 'req-3',
        method: 'test/method3',
        params: {},
      },
    ];

    const sendPromises = requests.map((req) => transport.send(req));

    expect(transport.getPendingRequests().size).toBe(3);

    const responses = [
      {
        jsonrpc: '2.0' as const,
        id: 'req-2',
        result: { success: true, request: 2 },
      },
      {
        jsonrpc: '2.0' as const,
        id: 'req-1',
        result: { success: true, request: 1 },
      },
      {
        jsonrpc: '2.0' as const,
        id: 'req-3',
        error: { code: -1, message: 'Test error' },
      },
    ];

    responses.forEach((resp) => transport.testHandleMessage(resp));

    await expect(sendPromises[0]).resolves.toBeUndefined();
    await expect(sendPromises[1]).resolves.toBeUndefined();
    await expect(sendPromises[2]).rejects.toThrow('JSON-RPC error -1: Test error');

    expect(transport.getPendingRequests().size).toBe(0);
  });
});
