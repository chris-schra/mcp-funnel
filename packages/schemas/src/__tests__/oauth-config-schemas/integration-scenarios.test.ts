import { describe, it, expect } from 'vitest';
import { TargetServerSchema } from './test-imports.js';

describe('Integration scenarios', () => {
  it('should support complex real-world configuration', () => {
    const complexConfig = {
      name: 'production-api',
      transport: {
        type: 'sse' as const,
        url: 'https://secure-api.example.com/events',
        timeout: 60000,
        reconnect: {
          maxAttempts: 10,
          initialDelayMs: 2000,
          maxDelayMs: 60000,
          backoffMultiplier: 1.5,
        },
      },
      auth: {
        type: 'oauth2-client' as const,
        clientId: 'prod-client-12345',
        clientSecret: 'ultra-secret-key-67890',
        tokenEndpoint: 'https://auth.example.com/oauth/token',
        scope: 'api:read api:write monitoring:read',
        audience: 'https://api.example.com',
      },
      env: {
        API_VERSION: 'v2',
        LOG_LEVEL: 'info',
      },
    };

    expect(() => TargetServerSchema.parse(complexConfig)).not.toThrow();
    const result = TargetServerSchema.parse(complexConfig);
    expect(result.name).toBe('production-api');
    expect(result.transport?.type).toBe('sse');
    expect(result.auth?.type).toBe('oauth2-client');
    expect(result.command).toBeUndefined();
  });

  it('should support development configuration with fallback command', () => {
    const devConfig = {
      name: 'dev-server',
      command: 'npm',
      args: ['run', 'dev'],
      transport: {
        type: 'stdio' as const,
        command: 'node',
        args: ['--inspect', 'dev-server.js'],
        env: {
          NODE_ENV: 'development',
          DEBUG: '*',
        },
      },
      auth: {
        type: 'none' as const,
      },
    };

    expect(() => TargetServerSchema.parse(devConfig)).not.toThrow();
    const result = TargetServerSchema.parse(devConfig);
    expect(result.command).toBe('npm');
    if (result.transport?.type === 'stdio') {
      expect(result.transport.command).toBe('node');
    }
    expect(result.auth?.type).toBe('none');
  });

  it('should validate schema type consistency across all discriminated unions', () => {
    // Test that all auth types are properly discriminated
    const authTypes = ['none', 'bearer', 'oauth2-client', 'oauth2-code'];
    const transportTypes = ['stdio', 'sse'];

    authTypes.forEach((authType) => {
      transportTypes.forEach((transportType) => {
        const config = {
          name: `test-${authType}-${transportType}`,
          transport: {
            type: transportType,
            ...(transportType === 'stdio'
              ? { command: 'test' }
              : { url: 'https://example.com' }),
          },
          auth: {
            type: authType,
            ...(authType === 'bearer'
              ? { token: 'test-token' }
              : authType === 'oauth2-client'
                ? {
                    clientId: 'test',
                    clientSecret: 'test',
                    tokenEndpoint: 'https://auth.example.com/token',
                  }
                : authType === 'oauth2-code'
                  ? {
                      clientId: 'test',
                      authorizationEndpoint: 'https://auth.example.com/auth',
                      tokenEndpoint: 'https://auth.example.com/token',
                      redirectUri: 'https://app.example.com/callback',
                    }
                  : {}),
          },
        };

        expect(() => TargetServerSchema.parse(config)).not.toThrow();
      });
    });
  });
});
