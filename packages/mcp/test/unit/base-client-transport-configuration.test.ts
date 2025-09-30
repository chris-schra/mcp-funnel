/**
 * Tests for BaseClientTransport - Configuration Management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  IAuthProvider,
  BaseClientTransport,
  type BaseClientTransportConfig,
  type PendingRequest,
} from '@mcp-funnel/core';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { createMockAuthProvider } from './test-utils.js';

// Mock fetch globally for HTTP request tests
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

// Mock UUID module for predictable request IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

// Test implementation of BaseClientTransport for testing
class TestTransport extends BaseClientTransport {
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

  public getPendingRequests(): Map<string, PendingRequest> {
    return this.pendingRequests;
  }
}

describe('BaseClientTransport - Configuration Management', () => {
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
      reconnect: {
        maxAttempts: 3,
        initialDelayMs: 500,
        backoffMultiplier: 2,
        maxDelayMs: 8000,
      },
    };

    transport = new TestTransport(config);
  });

  it('validates URL during construction', () => {
    // Test that URL validation happens by checking that the transport was created successfully
    expect(transport).toBeDefined();
    expect(transport['config'].url).toBe('https://api.example.com/mcp');
  });

  it('throws error for invalid URL', () => {
    expect(() => {
      new TestTransport({ url: 'invalid-url' });
    }).toThrow('Invalid URL');
  });

  it('applies default timeout when not specified', () => {
    const defaultTransport = new TestTransport({
      url: 'https://example.com',
    });
    expect(defaultTransport['config'].timeout).toBe(30000);
  });

  it('applies custom timeout when specified', () => {
    expect(transport['config'].timeout).toBe(5000);
  });

  it('stores auth provider configuration', () => {
    expect(transport['config'].authProvider).toBe(mockAuthProvider);
  });
});
