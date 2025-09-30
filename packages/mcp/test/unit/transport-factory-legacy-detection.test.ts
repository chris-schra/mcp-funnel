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


describe('TransportFactory - Legacy Detection', () => {
  it('should detect legacy stdio config with command field', async () => {
    const legacyConfig = {
      command: 'node',
      args: ['--version'],
    };

    const transport = await createTransport(legacyConfig);

    expect(transport).toBeDefined();
    expect(transport.type).toBe('stdio');
  });

  it('should prefer explicit type over legacy detection', async () => {
    const config: InvalidConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
      command: 'node', // legacy field should be ignored
    };

    const transport = await createTransport(config);

    expect(transport.type).toBe('sse');
  });

  it('should handle missing command in legacy config', async () => {
    const legacyConfig = {
      args: ['--version'],
      // missing command field
    };

    await expect(createTransport(legacyConfig)).rejects.toThrow(
      'Invalid configuration: must specify either type or command field',
    );
  });
});
