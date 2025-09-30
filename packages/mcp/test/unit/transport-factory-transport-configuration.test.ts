import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IAuthProvider, ITokenStorage } from '@mcp-funnel/core';

import type {
  SSETransportConfig,
  StdioTransportConfig,
  TransportConfig,
} from '@mcp-funnel/models';
import { clearTransportCache } from '../../src/utils/transport/transport-cache';
import { createTransport } from '../../src/utils/transport/index.js';

// Type definitions for testing

type InvalidConfig = {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  timeout?: number;
  reconnect?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  };
} & Record<string, unknown>;

// Mock implementations for testing
const mockAuthProvider: IAuthProvider = {
  getHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
  isValid: vi.fn().mockResolvedValue(true),
  refresh: vi.fn().mockResolvedValue(undefined),
};

const mockTokenStorage: ITokenStorage = {
  store: vi.fn().mockResolvedValue(undefined),
  retrieve: vi.fn().mockResolvedValue({
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + 3600000),
    tokenType: 'Bearer',
  }),
  clear: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockResolvedValue(false),
  scheduleRefresh: vi.fn(),
};

describe('TransportFactory - Transport Configuration', () => {
  it('should apply default timeout for SSE transport', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    const transport = await createTransport(config);

    expect((transport.config as SSETransportConfig).timeout).toBe(30000); // default timeout
  });

  it('should apply custom timeout for SSE transport', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
      timeout: 60000,
    };

    const transport = await createTransport(config);

    expect((transport.config as SSETransportConfig).timeout).toBe(60000);
  });

  it('should apply default reconnect settings for SSE transport', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    const transport = await createTransport(config);

    expect(
      (transport.config as SSETransportConfig).reconnect?.maxAttempts,
    ).toBe(3);
    expect(
      (transport.config as SSETransportConfig).reconnect?.initialDelayMs,
    ).toBe(1000);
    expect((transport.config as SSETransportConfig).reconnect?.maxDelayMs).toBe(
      30000,
    );
    expect(
      (transport.config as SSETransportConfig).reconnect?.backoffMultiplier,
    ).toBe(2);
  });

  it('should merge custom reconnect settings with defaults', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
      reconnect: {
        maxAttempts: 5, // custom
        // other fields should use defaults
      },
    };

    const transport = await createTransport(config);

    expect(
      (transport.config as SSETransportConfig).reconnect?.maxAttempts,
    ).toBe(5);
    expect(
      (transport.config as SSETransportConfig).reconnect?.initialDelayMs,
    ).toBe(1000); // default
  });
});
