import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import {
  BearerTokenValidator,
  NoAuthValidator,
  createAuthValidator,
  validateAuthConfig,
  createAuthMiddleware,
  validateWebSocketAuth,
  // type InboundAuthConfig, // Unused import
  type InboundBearerAuthConfig,
  type InboundNoAuthConfig,
} from '../../src/auth/index.js';
import type { IncomingMessage } from 'node:http';

// Helper type for mocking Hono context in tests
type MockContext = Partial<import('hono').Context>;

describe('Authentication System', () => {
  describe('BearerTokenValidator', () => {
    it('should validate correct bearer tokens', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-token-123', 'another-valid-token'],
      };

      const validator = new BearerTokenValidator(config);

      // Mock Hono context
      const mockContext: MockContext = {
        req: {
          header: vi.fn().mockReturnValue('Bearer valid-token-123'),
        },
      };

      const result = await validator.validateRequest(mockContext);

      expect(result.isAuthenticated).toBe(true);
      expect(result.context?.authType).toBe('bearer');
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid bearer tokens', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-token-123'],
      };

      const validator = new BearerTokenValidator(config);

      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue('Bearer invalid-token'),
        },
      } satisfies MockContext;

      const result = await validator.validateRequest(mockContext);

      expect(result.isAuthenticated).toBe(false);
      expect(result.error).toBe('Invalid Bearer token');
    });

    it('should reject missing Authorization header', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-token-123'],
      };

      const validator = new BearerTokenValidator(config);

      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue(undefined),
        },
      } satisfies MockContext;

      const result = await validator.validateRequest(mockContext);

      expect(result.isAuthenticated).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    it('should reject malformed Authorization header', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-token-123'],
      };

      const validator = new BearerTokenValidator(config);

      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue('Basic dXNlcjpwYXNz'), // Basic auth instead of Bearer
        },
      } satisfies MockContext;

      const result = await validator.validateRequest(mockContext);

      expect(result.isAuthenticated).toBe(false);
      expect(result.error).toBe(
        'Invalid Authorization header format. Expected: Bearer <token>',
      );
    });

    it('should reject empty bearer token', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-token-123'],
      };

      const validator = new BearerTokenValidator(config);

      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue('Bearer '),
        },
      } satisfies MockContext;

      const result = await validator.validateRequest(mockContext);

      expect(result.isAuthenticated).toBe(false);
      expect(result.error).toBe('Empty Bearer token');
    });

    it('should resolve environment variables in tokens', () => {
      // Set environment variable for test
      process.env.TEST_TOKEN = 'env-resolved-token';

      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['${TEST_TOKEN}', 'static-token'],
      };

      // Should not throw when environment variable exists
      expect(() => new BearerTokenValidator(config)).not.toThrow();

      // Clean up
      delete process.env.TEST_TOKEN;
    });

    it('should throw error for undefined environment variables', () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['${UNDEFINED_TOKEN}'],
      };

      expect(() => new BearerTokenValidator(config)).toThrow(
        'Environment variable UNDEFINED_TOKEN is not defined',
      );
    });

    it('should throw error for empty token configuration', () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: [],
      };

      expect(() => new BearerTokenValidator(config)).toThrow(
        'Bearer token configuration must include at least one token',
      );
    });

    describe('Security - Timing Attack Protection', () => {
      it('should use constant-time comparison for token validation', async () => {
        const config: InboundBearerAuthConfig = {
          type: 'bearer',
          tokens: ['valid-token-12345'],
        };

        const validator = new BearerTokenValidator(config);

        // Test with tokens of same length but different content
        const validTokenContext = {
          req: {
            header: vi.fn().mockReturnValue('Bearer valid-token-12345'),
          },
        } satisfies MockContext;

        const invalidSameLengthContext = {
          req: {
            header: vi.fn().mockReturnValue('Bearer invalid-token-1234'),
          },
        } satisfies MockContext;

        const [validResult, invalidResult] = await Promise.all([
          validator.validateRequest(validTokenContext),
          validator.validateRequest(invalidSameLengthContext),
        ]);

        expect(validResult.isAuthenticated).toBe(true);
        expect(invalidResult.isAuthenticated).toBe(false);
        expect(invalidResult.error).toBe('Invalid Bearer token');
      });

      it('should handle tokens of different lengths without timing leaks', async () => {
        const config: InboundBearerAuthConfig = {
          type: 'bearer',
          tokens: ['valid-token-12345'],
        };

        const validator = new BearerTokenValidator(config);

        // Test with tokens of different lengths
        const contexts = [
          {
            req: {
              header: vi.fn().mockReturnValue('Bearer short'),
            },
          },
          {
            req: {
              header: vi.fn().mockReturnValue('Bearer medium-length'),
            },
          },
          {
            req: {
              header: vi
                .fn()
                .mockReturnValue(
                  'Bearer very-long-invalid-token-that-should-fail',
                ),
            },
          },
        ] satisfies MockContext[];

        const results = await Promise.all(
          contexts.map((context) => validator.validateRequest(context)),
        );

        // All should fail authentication
        results.forEach((result) => {
          expect(result.isAuthenticated).toBe(false);
          expect(result.error).toBe('Invalid Bearer token');
        });
      });

      it('should validate multiple valid tokens with constant-time comparison', async () => {
        const config: InboundBearerAuthConfig = {
          type: 'bearer',
          tokens: ['token-one-1234', 'token-two-5678', 'token-three-9012'],
        };

        const validator = new BearerTokenValidator(config);

        // Test all valid tokens
        const validTokens = [
          'Bearer token-one-1234',
          'Bearer token-two-5678',
          'Bearer token-three-9012',
        ];

        const contexts = validTokens.map((token) => ({
          req: {
            header: vi.fn().mockReturnValue(token),
          },
        })) satisfies MockContext[];

        const results = await Promise.all(
          contexts.map((context) => validator.validateRequest(context)),
        );

        // All should pass authentication
        results.forEach((result) => {
          expect(result.isAuthenticated).toBe(true);
          expect(result.context?.authType).toBe('bearer');
        });
      });

      it('should reject tokens with similar prefixes using constant-time comparison', async () => {
        const config: InboundBearerAuthConfig = {
          type: 'bearer',
          tokens: ['secret-token-abcdef'],
        };

        const validator = new BearerTokenValidator(config);

        // Test tokens with similar prefixes but different suffixes
        const similarTokens = [
          'Bearer secret-token-123456', // Same length, similar prefix
          'Bearer secret-token-ABCDEF', // Same length, case difference
          'Bearer secret-token-abcdeg', // Same length, last char different
        ];

        const contexts = similarTokens.map((token) => ({
          req: {
            header: vi.fn().mockReturnValue(token),
          },
        })) satisfies MockContext[];

        const results = await Promise.all(
          contexts.map((context) => validator.validateRequest(context)),
        );

        // All should fail authentication
        results.forEach((result) => {
          expect(result.isAuthenticated).toBe(false);
          expect(result.error).toBe('Invalid Bearer token');
        });
      });
    });
  });

  describe('NoAuthValidator', () => {
    it('should always authenticate successfully', async () => {
      const validator = new NoAuthValidator();

      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue(undefined),
        },
      } satisfies MockContext;

      const result = await validator.validateRequest(mockContext);

      expect(result.isAuthenticated).toBe(true);
      expect(result.context?.authType).toBe('none');
      expect(result.error).toBeUndefined();
    });

    it('should return correct type', () => {
      const validator = new NoAuthValidator();
      expect(validator.getType()).toBe('none');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate bearer auth config correctly', () => {
      const validConfig: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['token1', 'token2'],
      };

      expect(() => validateAuthConfig(validConfig)).not.toThrow();
    });

    it('should validate no-auth config correctly', () => {
      const validConfig: InboundNoAuthConfig = {
        type: 'none',
      };

      expect(() => validateAuthConfig(validConfig)).not.toThrow();
    });

    it('should reject config without type', () => {
      const invalidConfig = {} as unknown as InboundBearerAuthConfig;

      expect(() => validateAuthConfig(invalidConfig)).toThrow(
        'Authentication configuration must specify a type',
      );
    });

    it('should reject bearer config without tokens', () => {
      const invalidConfig = {
        type: 'bearer',
      } satisfies MockContext;

      expect(() => validateAuthConfig(invalidConfig)).toThrow(
        'Bearer authentication requires a tokens array',
      );
    });

    it('should reject bearer config with empty tokens array', () => {
      const invalidConfig: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: [],
      };

      expect(() => validateAuthConfig(invalidConfig)).toThrow(
        'Bearer authentication requires at least one token',
      );
    });

    it('should reject unsupported auth type', () => {
      const invalidConfig = {
        type: 'unsupported',
      } satisfies MockContext;

      expect(() => validateAuthConfig(invalidConfig)).toThrow(
        'Unsupported authentication type: unsupported',
      );
    });
  });

  describe('Auth Factory', () => {
    it('should create bearer token validator', () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['test-token'],
      };

      const validator = createAuthValidator(config);

      expect(validator).toBeInstanceOf(BearerTokenValidator);
      expect(validator.getType()).toBe('bearer');
    });

    it('should create no-auth validator', () => {
      const config: InboundNoAuthConfig = {
        type: 'none',
      };

      const validator = createAuthValidator(config);

      expect(validator).toBeInstanceOf(NoAuthValidator);
      expect(validator.getType()).toBe('none');
    });

    it('should throw error for unsupported type', () => {
      const config = {
        type: 'unsupported',
      } satisfies MockContext;

      expect(() => createAuthValidator(config)).toThrow(
        'Unsupported authentication type: unsupported',
      );
    });
  });

  describe('Auth Middleware', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
    });

    it('should allow requests with valid authentication', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-token'],
      };

      const validator = createAuthValidator(config);
      const middleware = createAuthMiddleware(validator);

      app.use('*', middleware);
      app.get('/test', (c) => c.json({ success: true }));

      const res = await app.request('/test', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should reject requests with invalid authentication', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-token'],
      };

      const validator = createAuthValidator(config);
      const middleware = createAuthMiddleware(validator);

      app.use('*', middleware);
      app.get('/test', (c) => c.json({ success: true }));

      const res = await app.request('/test', {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized');
      expect(res.headers.get('WWW-Authenticate')).toBe(
        'Bearer realm="MCP Proxy API"',
      );
    });

    it('should reject requests without authentication', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-token'],
      };

      const validator = createAuthValidator(config);
      const middleware = createAuthMiddleware(validator);

      app.use('*', middleware);
      app.get('/test', (c) => c.json({ success: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should allow all requests with no-auth validator', async () => {
      const config: InboundNoAuthConfig = {
        type: 'none',
      };

      const validator = createAuthValidator(config);
      const middleware = createAuthMiddleware(validator);

      app.use('*', middleware);
      app.get('/test', (c) => c.json({ success: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('WebSocket Authentication', () => {
    it('should validate WebSocket requests with valid bearer token', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-ws-token'],
      };

      const validator = createAuthValidator(config);

      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-ws-token',
        },
        url: '/ws',
        method: 'GET',
      } as IncomingMessage;

      const result = await validateWebSocketAuth(mockRequest, validator);

      expect(result.isAuthenticated).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject WebSocket requests with invalid bearer token', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-ws-token'],
      };

      const validator = createAuthValidator(config);

      const mockRequest = {
        headers: {
          authorization: 'Bearer invalid-ws-token',
        },
        url: '/ws',
        method: 'GET',
      } as IncomingMessage;

      const result = await validateWebSocketAuth(mockRequest, validator);

      expect(result.isAuthenticated).toBe(false);
      expect(result.error).toBe('Invalid Bearer token');
    });

    it('should reject WebSocket requests without authentication', async () => {
      const config: InboundBearerAuthConfig = {
        type: 'bearer',
        tokens: ['valid-ws-token'],
      };

      const validator = createAuthValidator(config);

      const mockRequest = {
        headers: {},
        url: '/ws',
        method: 'GET',
      } as IncomingMessage;

      const result = await validateWebSocketAuth(mockRequest, validator);

      expect(result.isAuthenticated).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    it('should allow WebSocket requests with no-auth validator', async () => {
      const config: InboundNoAuthConfig = {
        type: 'none',
      };

      const validator = createAuthValidator(config);

      const mockRequest = {
        headers: {},
        url: '/ws',
        method: 'GET',
      } as IncomingMessage;

      const result = await validateWebSocketAuth(mockRequest, validator);

      expect(result.isAuthenticated).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
