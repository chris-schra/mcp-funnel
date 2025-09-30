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

describe('TransportFactory - Transport Creation', () => {
  it('should create stdio transport for stdio config', async () => {
    const config: TransportConfig = {
      type: 'stdio',
      command: 'node',
      args: ['--version'],
      env: { NODE_ENV: 'test' },
    };

    // Factory would create appropriate transport based on config type
    const transport = await createTransport(config);

    expect(transport).toBeDefined();
    expect(transport.type).toBe('stdio');
  });

  it('should create SSE transport for sse config', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
      timeout: 30000,
      reconnect: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
    };

    const transport = await createTransport(config);

    expect(transport).toBeDefined();
    expect(transport.type).toBe('sse');
  });

  it('should throw error for unknown transport type', async () => {
    const config: InvalidConfig = {
      type: 'unknown',
      command: 'test',
    };

    await expect(createTransport(config)).rejects.toThrow(
      'Unsupported transport type: unknown',
    );
  });

  it('should apply default values for optional config fields', async () => {
    const config: TransportConfig = {
      type: 'stdio',
      command: 'node',
    };

    const transport = await createTransport(config);

    expect(transport).toBeDefined();
    // Should have applied defaults for args and env
  });
});
