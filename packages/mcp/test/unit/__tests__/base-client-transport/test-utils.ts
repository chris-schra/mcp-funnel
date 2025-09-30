/**
 * Shared test utilities for BaseClientTransport tests
 */

import { beforeEach, afterEach, vi } from 'vitest';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';

import {
  BaseClientTransport,
  type BaseClientTransportConfig,
  type PendingRequest,
  type IAuthProvider,
  TransportError,
} from '@mcp-funnel/core';

export type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';

export {
  BaseClientTransport,
  type BaseClientTransportConfig,
  type PendingRequest,
  type IAuthProvider,
  TransportError,
} from '@mcp-funnel/core';

// Mock fetch globally for HTTP request tests
export const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger module
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

// Mock UUID module for predictable request IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

// Test implementation of BaseClientTransport for testing
export class TestTransport extends BaseClientTransport {
  public sendMessageCalls: JSONRPCMessage[] = [];
  public connectCalls = 0;
  public closeCalls = 0;
  private _validateUrlCalls = 0;

  get validateUrlCalls(): number {
    return this._validateUrlCalls;
  }

  constructor(config: BaseClientTransportConfig) {
    super(config, 'test-transport');
  }

  protected validateAndNormalizeUrl(config: BaseClientTransportConfig): void {
    this._validateUrlCalls++;
    if (!config.url || !config.url.startsWith('http')) {
      throw new Error('Invalid URL');
    }
  }

  protected async connect(): Promise<void> {
    this.connectCalls++;
    // Simulate successful connection
    this.handleConnectionOpen();
  }

  protected async sendMessage(message: JSONRPCMessage): Promise<void> {
    this.sendMessageCalls.push(message);
  }

  protected async closeConnection(): Promise<void> {
    this.closeCalls++;
  }

  // Expose protected methods for testing
  public testHandleMessage(message: JSONRPCMessage): void {
    this.handleMessage(message);
  }

  public testHandleConnectionError(error: Error): void {
    this.handleConnectionError(error);
  }

  public testHandleConnectionClose(
    reason?: string,
    shouldReconnect = true,
    error?: TransportError,
  ): void {
    this.handleConnectionClose(reason, shouldReconnect, error);
  }

  public testParseMessage(data: string): JSONRPCMessage {
    return this.parseMessage(data);
  }

  public testExecuteHttpRequest(
    message: JSONRPCMessage,
    signal: AbortSignal,
  ): Promise<void> {
    return this.executeHttpRequest(message, signal);
  }

  public getPendingRequests(): Map<string, PendingRequest> {
    return this.pendingRequests;
  }

  public getReconnectionManager() {
    return this.reconnectionManager;
  }
}

/**
 * Setup function for base client transport tests
 */
export function setupBaseClientTransportTest() {
  let transport: TestTransport;
  let mockAuthProvider: IAuthProvider;
  let config: BaseClientTransportConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock auth provider
    mockAuthProvider = {
      getHeaders: vi.fn().mockResolvedValue({
        Authorization: 'Bearer mock-token',
      }),
      refresh: vi.fn().mockResolvedValue(undefined),
      isValid: vi.fn().mockResolvedValue(undefined),
    };

    // Standard configuration
    config = {
      url: 'https://api.example.com/mcp',
      timeout: 5000,
      authProvider: mockAuthProvider,
      reconnect: {
        maxAttempts: 3,
        initialDelayMs: 500,
        backoffMultiplier: 2,
        maxDelayMs: 8000,
      },
    };

    transport = new TestTransport(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  return {
    get transport() {
      return transport;
    },
    get mockAuthProvider() {
      return mockAuthProvider;
    },
    get config() {
      return config;
    },
    mockFetch,
  };
}