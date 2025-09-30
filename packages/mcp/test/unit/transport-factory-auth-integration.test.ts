import { describe, it, expect, vi } from 'vitest';
import type { IAuthProvider, ITokenStorage } from '@mcp-funnel/core';

import type { TransportConfig } from '@mcp-funnel/models';
import { createTransport } from '../../src/utils/transport/index.js';

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

describe('TransportFactory - Auth Integration', () => {
  it('should inject auth provider into transport', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    const transport = await createTransport(config, {
      authProvider: mockAuthProvider,
    });

    expect(transport.authProvider).toBe(mockAuthProvider);
  });

  it('should inject token storage into transport', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    const transport = await createTransport(config, {
      tokenStorage: mockTokenStorage,
    });

    expect(transport.tokenStorage).toBe(mockTokenStorage);
  });

  it('should inject both auth provider and token storage', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    const transport = await createTransport(config, {
      authProvider: mockAuthProvider,
      tokenStorage: mockTokenStorage,
    });

    expect(transport.authProvider).toBe(mockAuthProvider);
    expect(transport.tokenStorage).toBe(mockTokenStorage);
  });

  it('should work without auth dependencies for stdio transport', async () => {
    const config: TransportConfig = {
      type: 'stdio',
      command: 'node',
      args: ['--version'],
    };

    const transport = await createTransport(config);

    expect(transport).toBeDefined();
    expect(transport.authProvider).toBeUndefined();
    expect(transport.tokenStorage).toBeUndefined();
  });
});
