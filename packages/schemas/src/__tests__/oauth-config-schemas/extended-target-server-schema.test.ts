import { describe, it, expect } from 'vitest';
import { TargetServerSchema } from './test-imports.js';

describe('ExtendedTargetServerSchema', () => {
  describe('Legacy compatibility', () => {
    it('should accept command-only configurations', () => {
      const validCommandConfig = {
        name: 'legacy-server',
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'production' },
      };

      expect(() => TargetServerSchema.parse(validCommandConfig)).not.toThrow();
      const result = TargetServerSchema.parse(validCommandConfig);
      expect(result.name).toBe('legacy-server');
      expect(result.command).toBe('node');
      expect(result.args).toEqual(['server.js']);
      expect(result.env).toEqual({ NODE_ENV: 'production' });
    });

    it('should accept minimal command-only configurations', () => {
      const minimalCommandConfig = {
        name: 'minimal-server',
        command: 'echo',
      };

      expect(() =>
        TargetServerSchema.parse(minimalCommandConfig),
      ).not.toThrow();
      const result = TargetServerSchema.parse(minimalCommandConfig);
      expect(result.name).toBe('minimal-server');
      expect(result.command).toBe('echo');
    });
  });

  describe('Transport-only configurations', () => {
    it('should accept stdio transport without command', () => {
      const stdioTransportConfig = {
        name: 'stdio-server',
        transport: {
          type: 'stdio' as const,
          command: 'node',
          args: ['transport-server.js'],
          env: { DEBUG: 'true' },
        },
      };

      expect(() =>
        TargetServerSchema.parse(stdioTransportConfig),
      ).not.toThrow();
      const result = TargetServerSchema.parse(stdioTransportConfig);
      expect(result.name).toBe('stdio-server');
      expect(result.command).toBeUndefined();
      expect(result.transport?.type).toBe('stdio');
      if (result.transport?.type === 'stdio') {
        expect(result.transport.command).toBe('node');
      }
    });

    it('should accept SSE transport without command', () => {
      const sseTransportConfig = {
        name: 'sse-server',
        transport: {
          type: 'sse' as const,
          url: 'https://api.example.com/sse',
          timeout: 30000,
          reconnect: {
            maxAttempts: 5,
            initialDelayMs: 1000,
            maxDelayMs: 30000,
            backoffMultiplier: 2,
          },
        },
      };

      expect(() => TargetServerSchema.parse(sseTransportConfig)).not.toThrow();
      const result = TargetServerSchema.parse(sseTransportConfig);
      expect(result.name).toBe('sse-server');
      expect(result.command).toBeUndefined();
      expect(result.transport?.type).toBe('sse');
      if (result.transport?.type === 'sse') {
        expect(result.transport.url).toBe('https://api.example.com/sse');
      }
    });

    it('should accept minimal SSE transport configuration', () => {
      const minimalSseConfig = {
        name: 'minimal-sse',
        transport: {
          type: 'sse' as const,
          url: 'https://api.example.com/events',
        },
      };

      expect(() => TargetServerSchema.parse(minimalSseConfig)).not.toThrow();
      const result = TargetServerSchema.parse(minimalSseConfig);
      expect(result.transport?.type).toBe('sse');
      if (result.transport?.type === 'sse') {
        expect(result.transport.url).toBe('https://api.example.com/events');
        expect(result.transport.timeout).toBeUndefined();
        expect(result.transport.reconnect).toBeUndefined();
      }
    });
  });

  describe('Combined configurations', () => {
    it('should accept command + transport configurations', () => {
      const combinedConfig = {
        name: 'combined-server',
        command: 'fallback-command',
        args: ['--fallback'],
        transport: {
          type: 'stdio' as const,
          command: 'primary-transport',
          args: ['--primary'],
        },
        auth: {
          type: 'bearer' as const,
          token: 'secret-token',
        },
      };

      expect(() => TargetServerSchema.parse(combinedConfig)).not.toThrow();
      const result = TargetServerSchema.parse(combinedConfig);
      expect(result.command).toBe('fallback-command');
      if (result.transport?.type === 'stdio') {
        expect(result.transport.command).toBe('primary-transport');
      }
      expect(result.auth?.type).toBe('bearer');
    });

    it('should accept command + auth without transport', () => {
      const commandAuthConfig = {
        name: 'auth-server',
        command: 'authenticated-service',
        auth: {
          type: 'oauth2-client' as const,
          clientId: 'client-123',
          clientSecret: 'secret-456',
          tokenEndpoint: 'https://auth.example.com/token',
          scope: 'read write',
          audience: 'api.example.com',
        },
      };

      expect(() => TargetServerSchema.parse(commandAuthConfig)).not.toThrow();
      const result = TargetServerSchema.parse(commandAuthConfig);
      expect(result.command).toBe('authenticated-service');
      expect(result.auth?.type).toBe('oauth2-client');
      expect(result.transport).toBeUndefined();
    });

    it('should accept transport + auth without command', () => {
      const transportAuthConfig = {
        name: 'auth-transport-server',
        transport: {
          type: 'sse' as const,
          url: 'https://secure-api.example.com/events',
        },
        auth: {
          type: 'oauth2-code' as const,
          clientId: 'web-app-123',
          clientSecret: 'web-secret-456',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
          redirectUri: 'https://app.example.com/callback',
          scope: 'openid profile',
        },
      };

      expect(() => TargetServerSchema.parse(transportAuthConfig)).not.toThrow();
      const result = TargetServerSchema.parse(transportAuthConfig);
      expect(result.command).toBeUndefined();
      expect(result.transport?.type).toBe('sse');
      expect(result.auth?.type).toBe('oauth2-code');
    });
  });

  describe('Invalid configurations', () => {
    it('should reject configs with neither command nor transport', () => {
      const invalidConfig = {
        name: 'invalid-server',
        args: ['some-args'],
        env: { VAR: 'value' },
      };

      expect(() => TargetServerSchema.parse(invalidConfig)).toThrow(
        "Server must have either 'command' or 'transport'",
      );
    });

    it('should reject empty configurations', () => {
      const emptyConfig = {
        name: 'empty-server',
      };

      expect(() => TargetServerSchema.parse(emptyConfig)).toThrow(
        "Server must have either 'command' or 'transport'",
      );
    });

    it('should reject configs with missing name', () => {
      const noNameConfig = {
        command: 'valid-command',
      };

      expect(() => TargetServerSchema.parse(noNameConfig)).toThrow();
    });

    it('should reject configs with invalid transport type', () => {
      const invalidTransportConfig = {
        name: 'invalid-transport',
        transport: {
          type: 'invalid-type',
          command: 'test',
        },
      };

      expect(() => TargetServerSchema.parse(invalidTransportConfig)).toThrow();
    });

    it('should reject configs with invalid auth type', () => {
      const invalidAuthConfig = {
        name: 'invalid-auth',
        command: 'test',
        auth: {
          type: 'invalid-auth-type',
          token: 'test',
        },
      };

      expect(() => TargetServerSchema.parse(invalidAuthConfig)).toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle null values gracefully', () => {
      const configWithNulls = {
        name: 'null-test',
        command: 'test',
        args: null,
        env: null,
        transport: null,
        auth: null,
      };

      // Zod should either accept or reject null values consistently
      // This test documents the current behavior
      expect(() => TargetServerSchema.parse(configWithNulls)).toThrow();
    });

    it('should handle undefined optional fields', () => {
      const configWithUndefined = {
        name: 'undefined-test',
        command: 'test',
        args: undefined,
        env: undefined,
        transport: undefined,
        auth: undefined,
      };

      expect(() => TargetServerSchema.parse(configWithUndefined)).not.toThrow();
      const result = TargetServerSchema.parse(configWithUndefined);
      expect(result.args).toBeUndefined();
      expect(result.env).toBeUndefined();
      expect(result.transport).toBeUndefined();
      expect(result.auth).toBeUndefined();
    });

    it('should validate string types strictly', () => {
      const invalidStringConfig = {
        name: 123, // Should be string
        command: 'test',
      };

      expect(() => TargetServerSchema.parse(invalidStringConfig)).toThrow();
    });

    it('should validate array types strictly', () => {
      const invalidArrayConfig = {
        name: 'array-test',
        command: 'test',
        args: 'not-an-array', // Should be array
      };

      expect(() => TargetServerSchema.parse(invalidArrayConfig)).toThrow();
    });
  });
});
