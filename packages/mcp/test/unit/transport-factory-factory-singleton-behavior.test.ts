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


describe('TransportFactory - Factory Singleton Behavior', () => {
  it('should return same transport instance for identical config', async () => {
    const config: TransportConfig = {
      type: 'stdio',
      command: 'node',
      args: ['--version'],
    };

    const transport1 = await createTransport(config);
    const transport2 = await createTransport(config);

    expect(transport1).toBe(transport2);
  });

  it('should return different instances for different configs', async () => {
    const config1: TransportConfig = {
      type: 'stdio',
      command: 'node',
      args: ['--version'],
    };

    const config2: TransportConfig = {
      type: 'stdio',
      command: 'node',
      args: ['--help'],
    };

    const transport1 = await createTransport(config1);
    const transport2 = await createTransport(config2);

    expect(transport1).not.toBe(transport2);
  });

  it('should dispose of transports properly', async () => {
    const config: TransportConfig = {
      type: 'stdio',
      command: 'node',
      args: ['--version'],
    };

    const transport = await createTransport(config);

    await transport.dispose();

    expect(transport.isConnected()).toBe(false);
  });

  it('should return different transport instances for same config but different auth providers', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    // Create two different auth provider instances with same functionality
    const authProvider1: IAuthProvider = {
      getHeaders: vi
        .fn()
        .mockResolvedValue({ Authorization: 'Bearer token1' }),
      isValid: vi.fn().mockResolvedValue(true),
      refresh: vi.fn().mockResolvedValue(undefined),
    };

    const authProvider2: IAuthProvider = {
      getHeaders: vi
        .fn()
        .mockResolvedValue({ Authorization: 'Bearer token2' }),
      isValid: vi.fn().mockResolvedValue(true),
      refresh: vi.fn().mockResolvedValue(undefined),
    };

    const transport1 = await createTransport(config, {
      authProvider: authProvider1,
    });
    const transport2 = await createTransport(config, {
      authProvider: authProvider2,
    });

    // Should be different instances due to different auth provider instances
    expect(transport1).not.toBe(transport2);
    expect(transport1.authProvider).toBe(authProvider1);
    expect(transport2.authProvider).toBe(authProvider2);
  });

  it('should return different transport instances for same config but different token storage', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    // Create two different token storage instances with same functionality
    const tokenStorage1: ITokenStorage = {
      store: vi.fn().mockResolvedValue(undefined),
      retrieve: vi.fn().mockResolvedValue({
        accessToken: 'test-token-1',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      }),
      clear: vi.fn().mockResolvedValue(undefined),
      isExpired: vi.fn().mockResolvedValue(false),
    };

    const tokenStorage2: ITokenStorage = {
      store: vi.fn().mockResolvedValue(undefined),
      retrieve: vi.fn().mockResolvedValue({
        accessToken: 'test-token-2',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      }),
      clear: vi.fn().mockResolvedValue(undefined),
      isExpired: vi.fn().mockResolvedValue(false),
    };

    const transport1 = await createTransport(config, {
      tokenStorage: tokenStorage1,
    });
    const transport2 = await createTransport(config, {
      tokenStorage: tokenStorage2,
    });

    // Should be different instances due to different token storage instances
    expect(transport1).not.toBe(transport2);
    expect(transport1.tokenStorage).toBe(tokenStorage1);
    expect(transport2.tokenStorage).toBe(tokenStorage2);
  });

  it('should return same transport instance for same config and same auth provider instance', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    const authProvider: IAuthProvider = {
      getHeaders: vi
        .fn()
        .mockResolvedValue({ Authorization: 'Bearer token' }),
      isValid: vi.fn().mockResolvedValue(true),
      refresh: vi.fn().mockResolvedValue(undefined),
    };

    const transport1 = await createTransport(config, { authProvider });
    const transport2 = await createTransport(config, { authProvider });

    // Should be same instance since config and provider instance are identical
    expect(transport1).toBe(transport2);
  });
});
