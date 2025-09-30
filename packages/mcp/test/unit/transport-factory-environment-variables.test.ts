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

describe('TransportFactory - Environment Variables', () => {
  it('should resolve environment variables in command', async () => {
    process.env.NODE_PATH = '/usr/bin/node';

    const config: TransportConfig = {
      type: 'stdio',
      command: '${NODE_PATH}',
      args: ['--version'],
    };

    const transport = await createTransport(config);

    expect((transport.config as StdioTransportConfig).command).toBe(
      '/usr/bin/node',
    );
  });

  it('should resolve environment variables in args', async () => {
    process.env.TEST_ARG = '--test-mode';

    const config: TransportConfig = {
      type: 'stdio',
      command: 'node',
      args: ['${TEST_ARG}', '--version'],
    };

    const transport = await createTransport(config);

    expect((transport.config as StdioTransportConfig).args).toContain(
      '--test-mode',
    );
    expect((transport.config as StdioTransportConfig).args).toContain(
      '--version',
    );
  });

  it('should resolve environment variables in URL for SSE', async () => {
    process.env.API_BASE = 'https://api.example.com';

    const config: TransportConfig = {
      type: 'sse',
      url: '${API_BASE}/events',
    };

    const transport = await createTransport(config);

    expect((transport.config as SSETransportConfig).url).toBe(
      'https://api.example.com/events',
    );
  });

  it('should handle missing environment variables gracefully', async () => {
    const config: TransportConfig = {
      type: 'stdio',
      command: '${MISSING_VAR}',
    };

    await expect(createTransport(config)).rejects.toThrow(
      "Required environment variable 'MISSING_VAR' is not defined",
    );
  });

  it('should resolve nested environment variables', async () => {
    process.env.BIN_DIR = '/usr/bin';
    process.env.NODE_BIN = '${BIN_DIR}/node';

    const config: TransportConfig = {
      type: 'stdio',
      command: '${NODE_BIN}',
    };

    const transport = await createTransport(config);

    expect((transport.config as StdioTransportConfig).command).toBe(
      '/usr/bin/node',
    );
  });

  it('should merge config env with process env', async () => {
    process.env.GLOBAL_VAR = 'global';

    const config: TransportConfig = {
      type: 'stdio',
      command: 'node',
      env: {
        LOCAL_VAR: 'local',
        GLOBAL_VAR: 'overridden', // should override process env
      },
    };

    const transport = await createTransport(config);

    expect((transport.config as StdioTransportConfig).env?.LOCAL_VAR).toBe(
      'local',
    );
    expect((transport.config as StdioTransportConfig).env?.GLOBAL_VAR).toBe(
      'overridden',
    );
  });
});
