import { describe, it, expect, vi } from 'vitest';

import type { TransportConfig } from '@mcp-funnel/models';
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

describe('TransportFactory - Error Handling', () => {
  it('should throw for invalid stdio config missing command', async () => {
    const config: InvalidConfig = {
      type: 'stdio',
      args: ['--version'],
      // missing command
    };

    await expect(createTransport(config)).rejects.toThrow(
      'Command is required for stdio transport',
    );
  });

  it('should throw for invalid sse config missing url', async () => {
    const config: InvalidConfig = {
      type: 'sse',
      timeout: 30000,
      // missing url
    };

    await expect(createTransport(config)).rejects.toThrow(
      'URL is required for SSE transport',
    );
  });

  it('should throw for invalid sse url format', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'not-a-valid-url',
    };

    await expect(createTransport(config)).rejects.toThrow(
      'Invalid URL: not-a-valid-url',
    );
  });

  it('should validate reconnect configuration for SSE', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
      reconnect: {
        maxAttempts: -1, // invalid
      },
    };

    await expect(createTransport(config)).rejects.toThrow(
      'maxAttempts must be a positive number',
    );
  });

  it('should handle auth provider initialization failure', async () => {
    const failingAuthProvider = {
      getHeaders: vi
        .fn()
        .mockResolvedValue({ Authorization: 'Bearer test-token' }),
      isValid: vi.fn().mockRejectedValue(new Error('Auth failure')),
      refresh: vi.fn().mockResolvedValue(undefined),
    };

    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    await expect(
      createTransport(config, { authProvider: failingAuthProvider }),
    ).rejects.toThrow('Authentication failed: Auth failure');
  });

  it('should handle token storage initialization failure', async () => {
    const failingTokenStorage = {
      store: vi.fn().mockResolvedValue(undefined),
      retrieve: vi.fn().mockRejectedValue(new Error('Storage failure')),
      clear: vi.fn().mockResolvedValue(undefined),
      isExpired: vi.fn().mockResolvedValue(false),
      scheduleRefresh: vi.fn(),
    };

    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    await expect(
      createTransport(config, { tokenStorage: failingTokenStorage }),
    ).rejects.toThrow('Failed to initialize token storage: Storage failure');
  });
});
