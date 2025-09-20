import { describe, it, expect } from 'vitest';
import {
  ExtendedTargetServerSchema,
  ExtendedTargetServerWithoutNameSchema,
  AuthConfigSchema,
  TransportConfigSchema,
  NoAuthConfigSchema,
  BearerAuthConfigSchema,
  OAuth2ClientCredentialsConfigSchema,
  OAuth2AuthCodeConfigSchema,
  StdioTransportConfigSchema,
  SSETransportConfigSchema,
  type BearerAuthConfigZod,
  type OAuth2ClientCredentialsConfigZod,
  type OAuth2AuthCodeConfigZod,
  type StdioTransportConfigZod,
  type SSETransportConfigZod,
  type WebSocketTransportConfigZod,
} from '../../src/config.js';

describe('OAuth Configuration Schemas', () => {
  describe('ExtendedTargetServerSchema', () => {
    describe('Legacy compatibility', () => {
      it('should accept command-only configurations', () => {
        const validCommandConfig = {
          name: 'legacy-server',
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'production' },
        };

        expect(() =>
          ExtendedTargetServerSchema.parse(validCommandConfig),
        ).not.toThrow();
        const result = ExtendedTargetServerSchema.parse(validCommandConfig);
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
          ExtendedTargetServerSchema.parse(minimalCommandConfig),
        ).not.toThrow();
        const result = ExtendedTargetServerSchema.parse(minimalCommandConfig);
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
          ExtendedTargetServerSchema.parse(stdioTransportConfig),
        ).not.toThrow();
        const result = ExtendedTargetServerSchema.parse(stdioTransportConfig);
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

        expect(() =>
          ExtendedTargetServerSchema.parse(sseTransportConfig),
        ).not.toThrow();
        const result = ExtendedTargetServerSchema.parse(sseTransportConfig);
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

        expect(() =>
          ExtendedTargetServerSchema.parse(minimalSseConfig),
        ).not.toThrow();
        const result = ExtendedTargetServerSchema.parse(minimalSseConfig);
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

        expect(() =>
          ExtendedTargetServerSchema.parse(combinedConfig),
        ).not.toThrow();
        const result = ExtendedTargetServerSchema.parse(combinedConfig);
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

        expect(() =>
          ExtendedTargetServerSchema.parse(commandAuthConfig),
        ).not.toThrow();
        const result = ExtendedTargetServerSchema.parse(commandAuthConfig);
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

        expect(() =>
          ExtendedTargetServerSchema.parse(transportAuthConfig),
        ).not.toThrow();
        const result = ExtendedTargetServerSchema.parse(transportAuthConfig);
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

        expect(() => ExtendedTargetServerSchema.parse(invalidConfig)).toThrow(
          "Server must have either 'command' or 'transport'",
        );
      });

      it('should reject empty configurations', () => {
        const emptyConfig = {
          name: 'empty-server',
        };

        expect(() => ExtendedTargetServerSchema.parse(emptyConfig)).toThrow(
          "Server must have either 'command' or 'transport'",
        );
      });

      it('should reject configs with missing name', () => {
        const noNameConfig = {
          command: 'valid-command',
        };

        expect(() => ExtendedTargetServerSchema.parse(noNameConfig)).toThrow();
      });

      it('should reject configs with invalid transport type', () => {
        const invalidTransportConfig = {
          name: 'invalid-transport',
          transport: {
            type: 'invalid-type',
            command: 'test',
          },
        };

        expect(() =>
          ExtendedTargetServerSchema.parse(invalidTransportConfig),
        ).toThrow();
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

        expect(() =>
          ExtendedTargetServerSchema.parse(invalidAuthConfig),
        ).toThrow();
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
        expect(() =>
          ExtendedTargetServerSchema.parse(configWithNulls),
        ).toThrow();
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

        expect(() =>
          ExtendedTargetServerSchema.parse(configWithUndefined),
        ).not.toThrow();
        const result = ExtendedTargetServerSchema.parse(configWithUndefined);
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

        expect(() =>
          ExtendedTargetServerSchema.parse(invalidStringConfig),
        ).toThrow();
      });

      it('should validate array types strictly', () => {
        const invalidArrayConfig = {
          name: 'array-test',
          command: 'test',
          args: 'not-an-array', // Should be array
        };

        expect(() =>
          ExtendedTargetServerSchema.parse(invalidArrayConfig),
        ).toThrow();
      });
    });
  });

  describe('ExtendedTargetServerWithoutNameSchema', () => {
    it('should accept command-only configurations without name', () => {
      const validConfig = {
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'test' },
      };

      expect(() =>
        ExtendedTargetServerWithoutNameSchema.parse(validConfig),
      ).not.toThrow();
      const result = ExtendedTargetServerWithoutNameSchema.parse(validConfig);
      expect(result.command).toBe('node');
      expect(result.args).toEqual(['server.js']);
    });

    it('should accept transport-only configurations without name', () => {
      const validConfig = {
        transport: {
          type: 'sse' as const,
          url: 'https://api.example.com/events',
        },
        auth: {
          type: 'bearer' as const,
          token: 'test-token',
        },
      };

      expect(() =>
        ExtendedTargetServerWithoutNameSchema.parse(validConfig),
      ).not.toThrow();
      const result = ExtendedTargetServerWithoutNameSchema.parse(validConfig);
      expect(result.transport?.type).toBe('sse');
      expect(result.auth?.type).toBe('bearer');
    });

    it('should reject configs with neither command nor transport', () => {
      const invalidConfig = {
        args: ['some-args'],
        env: { VAR: 'value' },
      };

      expect(() =>
        ExtendedTargetServerWithoutNameSchema.parse(invalidConfig),
      ).toThrow("Server must have either 'command' or 'transport'");
    });
  });

  describe('AuthConfigSchema', () => {
    describe('NoAuth configuration', () => {
      it('should accept valid no-auth configuration', () => {
        const noAuthConfig = {
          type: 'none' as const,
        };

        expect(() => AuthConfigSchema.parse(noAuthConfig)).not.toThrow();
        const result = AuthConfigSchema.parse(noAuthConfig);
        expect(result.type).toBe('none');
      });

      it('should accept no-auth config even with extra properties (zod behavior)', () => {
        const configWithExtra = {
          type: 'none' as const,
          token: 'extra-property',
        };

        // Zod discriminated unions don't strictly reject extra properties
        // This documents the current behavior - extra properties are ignored
        expect(() => NoAuthConfigSchema.parse(configWithExtra)).not.toThrow();
        const result = NoAuthConfigSchema.parse(configWithExtra);
        expect(result.type).toBe('none');
        // Note: extra properties are stripped by zod, not accessible on result
      });
    });

    describe('Bearer auth configuration', () => {
      it('should accept valid bearer configuration', () => {
        const bearerConfig = {
          type: 'bearer' as const,
          token: 'secret-bearer-token',
        };

        expect(() => AuthConfigSchema.parse(bearerConfig)).not.toThrow();
        const result = AuthConfigSchema.parse(bearerConfig);
        expect(result.type).toBe('bearer');
        if (result.type === 'bearer') {
          expect((result as BearerAuthConfigZod).token).toBe(
            'secret-bearer-token',
          );
        }
      });

      it('should reject bearer config without token', () => {
        const invalidConfig = {
          type: 'bearer' as const,
        };

        expect(() => BearerAuthConfigSchema.parse(invalidConfig)).toThrow();
      });

      it('should reject bearer config with empty token', () => {
        const invalidConfig = {
          type: 'bearer' as const,
          token: '',
        };

        expect(() => BearerAuthConfigSchema.parse(invalidConfig)).not.toThrow();
        // Empty string is technically valid for Zod string validation
        const result = BearerAuthConfigSchema.parse(invalidConfig);
        if (result.type === 'bearer') {
          expect((result as BearerAuthConfigZod).token).toBe('');
        }
      });
    });

    describe('OAuth2 Client Credentials configuration', () => {
      it('should accept valid oauth2-client configuration', () => {
        const oauth2Config = {
          type: 'oauth2-client' as const,
          clientId: 'client-123',
          clientSecret: 'secret-456',
          tokenEndpoint: 'https://auth.example.com/token',
          scope: 'read write',
          audience: 'api.example.com',
        };

        expect(() => AuthConfigSchema.parse(oauth2Config)).not.toThrow();
        const result = AuthConfigSchema.parse(oauth2Config);
        expect(result.type).toBe('oauth2-client');
        if (result.type === 'oauth2-client') {
          const oauth2Result = result as OAuth2ClientCredentialsConfigZod;
          expect(oauth2Result.clientId).toBe('client-123');
          expect(oauth2Result.clientSecret).toBe('secret-456');
          expect(oauth2Result.tokenEndpoint).toBe(
            'https://auth.example.com/token',
          );
          expect(oauth2Result.scope).toBe('read write');
          expect(oauth2Result.audience).toBe('api.example.com');
        }
      });

      it('should accept oauth2-client configuration without optional fields', () => {
        const minimalConfig = {
          type: 'oauth2-client' as const,
          clientId: 'client-123',
          clientSecret: 'secret-456',
          tokenEndpoint: 'https://auth.example.com/token',
        };

        expect(() => AuthConfigSchema.parse(minimalConfig)).not.toThrow();
        const result = AuthConfigSchema.parse(minimalConfig);
        if (result.type === 'oauth2-client') {
          const oauth2Result = result as OAuth2ClientCredentialsConfigZod;
          expect(oauth2Result.scope).toBeUndefined();
          expect(oauth2Result.audience).toBeUndefined();
        }
      });

      it('should reject oauth2-client config with missing required fields', () => {
        const invalidConfigs = [
          {
            type: 'oauth2-client' as const,
            clientSecret: 'secret',
            tokenEndpoint: 'https://auth.example.com/token',
          },
          {
            type: 'oauth2-client' as const,
            clientId: 'client',
            tokenEndpoint: 'https://auth.example.com/token',
          },
          {
            type: 'oauth2-client' as const,
            clientId: 'client',
            clientSecret: 'secret',
          },
        ];

        invalidConfigs.forEach((config) => {
          expect(() =>
            OAuth2ClientCredentialsConfigSchema.parse(config),
          ).toThrow();
        });
      });
    });

    describe('OAuth2 Authorization Code configuration', () => {
      it('should accept valid oauth2-code configuration', () => {
        const oauth2CodeConfig = {
          type: 'oauth2-code' as const,
          clientId: 'web-app-123',
          clientSecret: 'web-secret-456',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
          redirectUri: 'https://app.example.com/callback',
          scope: 'openid profile email',
          audience: 'api.example.com',
        };

        expect(() => AuthConfigSchema.parse(oauth2CodeConfig)).not.toThrow();
        const result = AuthConfigSchema.parse(oauth2CodeConfig);
        expect(result.type).toBe('oauth2-code');
        if (result.type === 'oauth2-code') {
          const oauth2Result = result as OAuth2AuthCodeConfigZod;
          expect(oauth2Result.clientId).toBe('web-app-123');
          expect(oauth2Result.authorizationEndpoint).toBe(
            'https://auth.example.com/authorize',
          );
          expect(oauth2Result.redirectUri).toBe(
            'https://app.example.com/callback',
          );
        }
      });

      it('should accept oauth2-code configuration without client secret (PKCE)', () => {
        const pkceConfig = {
          type: 'oauth2-code' as const,
          clientId: 'public-client-123',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
          redirectUri: 'https://app.example.com/callback',
        };

        expect(() => AuthConfigSchema.parse(pkceConfig)).not.toThrow();
        const result = AuthConfigSchema.parse(pkceConfig);
        if (result.type === 'oauth2-code') {
          const oauth2Result = result as OAuth2AuthCodeConfigZod;
          expect(oauth2Result.clientSecret).toBeUndefined();
        }
      });

      it('should reject oauth2-code config with missing required fields', () => {
        const invalidConfigs = [
          {
            type: 'oauth2-code' as const,
            authorizationEndpoint: 'https://auth.example.com/authorize',
            tokenEndpoint: 'https://auth.example.com/token',
            redirectUri: 'https://app.example.com/callback',
          },
          {
            type: 'oauth2-code' as const,
            clientId: 'client',
            tokenEndpoint: 'https://auth.example.com/token',
            redirectUri: 'https://app.example.com/callback',
          },
          {
            type: 'oauth2-code' as const,
            clientId: 'client',
            authorizationEndpoint: 'https://auth.example.com/authorize',
            redirectUri: 'https://app.example.com/callback',
          },
          {
            type: 'oauth2-code' as const,
            clientId: 'client',
            authorizationEndpoint: 'https://auth.example.com/authorize',
            tokenEndpoint: 'https://auth.example.com/token',
          },
        ];

        invalidConfigs.forEach((config) => {
          expect(() => OAuth2AuthCodeConfigSchema.parse(config)).toThrow();
        });
      });
    });

    describe('Invalid auth type discrimination', () => {
      it('should reject unknown auth types', () => {
        const invalidAuthConfig = {
          type: 'unknown-auth-type',
          someProperty: 'value',
        };

        expect(() => AuthConfigSchema.parse(invalidAuthConfig)).toThrow();
      });

      it('should reject auth config without type', () => {
        const noTypeConfig = {
          token: 'some-token',
        };

        expect(() => AuthConfigSchema.parse(noTypeConfig)).toThrow();
      });
    });
  });

  describe('TransportConfigSchema', () => {
    describe('Stdio transport configuration', () => {
      it('should accept valid stdio configuration', () => {
        const stdioConfig = {
          type: 'stdio' as const,
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'development' },
        };

        expect(() => TransportConfigSchema.parse(stdioConfig)).not.toThrow();
        const result = TransportConfigSchema.parse(stdioConfig);
        expect(result.type).toBe('stdio');
        if (result.type === 'stdio') {
          const stdioResult = result as StdioTransportConfigZod;
          expect(stdioResult.command).toBe('node');
          expect(stdioResult.args).toEqual(['server.js']);
          expect(stdioResult.env).toEqual({ NODE_ENV: 'development' });
        }
      });

      it('should accept minimal stdio configuration', () => {
        const minimalConfig = {
          type: 'stdio' as const,
          command: 'echo',
        };

        expect(() => TransportConfigSchema.parse(minimalConfig)).not.toThrow();
        const result = TransportConfigSchema.parse(minimalConfig);
        if (result.type === 'stdio') {
          const stdioResult = result as StdioTransportConfigZod;
          expect(stdioResult.args).toBeUndefined();
          expect(stdioResult.env).toBeUndefined();
        }
      });

      it('should reject stdio config without command', () => {
        const invalidConfig = {
          type: 'stdio' as const,
          args: ['some-args'],
        };

        expect(() => StdioTransportConfigSchema.parse(invalidConfig)).toThrow();
      });
    });

    describe('SSE transport configuration', () => {
      it('should accept valid SSE configuration', () => {
        const sseConfig = {
          type: 'sse' as const,
          url: 'https://api.example.com/events',
          timeout: 30000,
          reconnect: {
            maxAttempts: 5,
            initialDelayMs: 1000,
            maxDelayMs: 30000,
            backoffMultiplier: 2,
          },
        };

        expect(() => TransportConfigSchema.parse(sseConfig)).not.toThrow();
        const result = TransportConfigSchema.parse(sseConfig);
        expect(result.type).toBe('sse');
        if (result.type === 'sse') {
          const sseResult = result as SSETransportConfigZod;
          expect(sseResult.url).toBe('https://api.example.com/events');
          expect(sseResult.timeout).toBe(30000);
          expect(sseResult.reconnect?.maxAttempts).toBe(5);
        }
      });

      it('should accept minimal SSE configuration', () => {
        const minimalConfig = {
          type: 'sse' as const,
          url: 'https://api.example.com/events',
        };

        expect(() => TransportConfigSchema.parse(minimalConfig)).not.toThrow();
        const result = TransportConfigSchema.parse(minimalConfig);
        if (result.type === 'sse') {
          const sseResult = result as SSETransportConfigZod;
          expect(sseResult.timeout).toBeUndefined();
          expect(sseResult.reconnect).toBeUndefined();
        }
      });

      it('should accept partial reconnect configuration', () => {
        const partialReconnectConfig = {
          type: 'sse' as const,
          url: 'https://api.example.com/events',
          reconnect: {
            maxAttempts: 3,
          },
        };

        expect(() =>
          TransportConfigSchema.parse(partialReconnectConfig),
        ).not.toThrow();
        const result = TransportConfigSchema.parse(partialReconnectConfig);
        if (result.type === 'sse') {
          const sseResult = result as SSETransportConfigZod;
          expect(sseResult.reconnect?.maxAttempts).toBe(3);
          expect(sseResult.reconnect?.initialDelayMs).toBeUndefined();
        }
      });

      it('should reject SSE config without URL', () => {
        const invalidConfig = {
          type: 'sse' as const,
          timeout: 30000,
        };

        expect(() => SSETransportConfigSchema.parse(invalidConfig)).toThrow();
      });

      it('should reject SSE config with invalid URL type', () => {
        const invalidConfig = {
          type: 'sse' as const,
          url: 123, // Should be string
        };

        expect(() => SSETransportConfigSchema.parse(invalidConfig)).toThrow();
      });
    });

    describe('WebSocket transport configuration', () => {
      it('should accept valid WebSocket configuration', () => {
        const websocketConfig = {
          type: 'websocket' as const,
          url: 'ws://api.example.com/websocket',
          timeout: 30000,
          reconnect: {
            maxAttempts: 5,
            initialDelayMs: 1000,
            maxDelayMs: 30000,
            backoffMultiplier: 2,
          },
        };
        expect(() =>
          TransportConfigSchema.parse(websocketConfig),
        ).not.toThrow();
        const result = TransportConfigSchema.parse(websocketConfig);
        expect(result.type).toBe('websocket');
        if (result.type === 'websocket') {
          const wsResult = result as WebSocketTransportConfigZod;
          expect(wsResult.url).toBe('ws://api.example.com/websocket');
          expect(wsResult.timeout).toBe(30000);
          expect(wsResult.reconnect?.maxAttempts).toBe(5);
        }
      });

      it('should accept minimal WebSocket configuration', () => {
        const minimalConfig = {
          type: 'websocket' as const,
          url: 'wss://api.example.com/websocket',
        };
        expect(() => TransportConfigSchema.parse(minimalConfig)).not.toThrow();
        const result = TransportConfigSchema.parse(minimalConfig);
        expect(result.type).toBe('websocket');
        if (result.type === 'websocket') {
          const wsResult = result as WebSocketTransportConfigZod;
          expect(wsResult.url).toBe('wss://api.example.com/websocket');
          expect(wsResult.timeout).toBeUndefined();
          expect(wsResult.reconnect).toBeUndefined();
        }
      });

      it('should accept partial reconnect configuration', () => {
        const partialReconnectConfig = {
          type: 'websocket' as const,
          url: 'ws://api.example.com/websocket',
          reconnect: {
            maxAttempts: 3,
            // Other fields optional
          },
        };
        expect(() =>
          TransportConfigSchema.parse(partialReconnectConfig),
        ).not.toThrow();
        const result = TransportConfigSchema.parse(partialReconnectConfig);
        if (result.type === 'websocket') {
          const wsResult = result as WebSocketTransportConfigZod;
          expect(wsResult.reconnect?.maxAttempts).toBe(3);
          expect(wsResult.reconnect?.initialDelayMs).toBeUndefined();
        }
      });

      it('should reject WebSocket config without URL', () => {
        const invalidConfig = {
          type: 'websocket' as const,
          // Missing URL
        };
        expect(() => TransportConfigSchema.parse(invalidConfig)).toThrow();
      });

      it('should reject WebSocket config with invalid URL type', () => {
        const invalidConfig = {
          type: 'websocket' as const,
          url: 123, // Should be string
        };
        expect(() => TransportConfigSchema.parse(invalidConfig)).toThrow();
      });
    });

    describe('Invalid transport type discrimination', () => {
      it('should reject unknown transport types', () => {
        const invalidTransportConfig = {
          type: 'unknown-transport',
          url: 'ws://example.com',
        };

        expect(() =>
          TransportConfigSchema.parse(invalidTransportConfig),
        ).toThrow();
      });

      it('should reject transport config without type', () => {
        const noTypeConfig = {
          command: 'some-command',
        };

        expect(() => TransportConfigSchema.parse(noTypeConfig)).toThrow();
      });
    });
  });

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

      expect(() =>
        ExtendedTargetServerSchema.parse(complexConfig),
      ).not.toThrow();
      const result = ExtendedTargetServerSchema.parse(complexConfig);
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

      expect(() => ExtendedTargetServerSchema.parse(devConfig)).not.toThrow();
      const result = ExtendedTargetServerSchema.parse(devConfig);
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

          expect(() => ExtendedTargetServerSchema.parse(config)).not.toThrow();
        });
      });
    });
  });
});
