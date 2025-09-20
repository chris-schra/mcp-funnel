import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  TransportConfig,
  StdioTransportConfig,
  SSETransportConfig,
} from '../../src/types/transport.types.js';
import type { IAuthProvider } from '../../src/auth/interfaces/auth-provider.interface.js';
import type { ITokenStorage } from '../../src/auth/interfaces/token-storage.interface.js';
import {
  createTransport,
  clearTransportCache,
} from '../../src/transports/transport-factory.js';

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

// TODO: Mock transport implementations that would be created by the factory
const _mockStdioTransport = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  receive: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
};

const _mockSSETransport = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  receive: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
};

describe('TransportFactory', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    clearTransportCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearTransportCache();
  });

  describe('Transport Creation', () => {
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

  describe('Legacy Detection', () => {
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

  describe('Auth Integration', () => {
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

  describe('Environment Variables', () => {
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
        'Environment variable MISSING_VAR is not defined',
      );
    });

    it('should not resolve nested environment variables', async () => {
      process.env.BIN_DIR = '/usr/bin';
      process.env.NODE_BIN = '${BIN_DIR}/node';

      const config: TransportConfig = {
        type: 'stdio',
        command: '${NODE_BIN}',
      };

      const transport = await createTransport(config);

      // Nested environment variable resolution is not supported
      expect((transport.config as StdioTransportConfig).command).toBe(
        '${BIN_DIR}/node',
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

  describe('Error Handling', () => {
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
        ...mockAuthProvider,
        isValid: vi.fn().mockRejectedValue(new Error('Auth failure')),
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
        ...mockTokenStorage,
        retrieve: vi.fn().mockRejectedValue(new Error('Storage failure')),
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

  describe('Transport Configuration', () => {
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
      expect(
        (transport.config as SSETransportConfig).reconnect?.maxDelayMs,
      ).toBe(30000);
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

  describe('Factory Singleton Behavior', () => {
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
  });
});

// createTransport is now imported from the actual implementation
// No placeholder function needed
