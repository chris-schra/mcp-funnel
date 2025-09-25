import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
type CryptoModule = typeof import('crypto');
type TimingSafeEqualFn = CryptoModule['timingSafeEqual'];

type TimingSafeEqualMock = MockInstance<
  Parameters<TimingSafeEqualFn>,
  ReturnType<TimingSafeEqualFn>
>;

const timingSafeEqualSpy: TimingSafeEqualMock = vi.hoisted(() =>
  vi.fn<TimingSafeEqualFn>(),
);

vi.mock('crypto', async () => {
  const actual = await vi.importActual<CryptoModule>('crypto');

  timingSafeEqualSpy.mockImplementation((...args) =>
    actual.timingSafeEqual(...args),
  );

  return {
    ...actual,
    timingSafeEqual: timingSafeEqualSpy,
  };
});

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

afterEach(() => {
  timingSafeEqualSpy.mockClear();
});

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
        "Required environment variable 'UNDEFINED_TOKEN' is not defined",
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
      const defaultIterations = 5000;

      const measureAverageNanoseconds = async (
        validator: BearerTokenValidator,
        headerValue: string,
        runs: number = defaultIterations,
      ): Promise<number> => {
        const context = {
          req: {
            header: () => headerValue,
          },
        } satisfies MockContext;

        const start = process.hrtime.bigint();
        for (let index = 0; index < runs; index += 1) {
          await validator.validateRequest(context);
        }
        const end = process.hrtime.bigint();

        return Number(end - start) / runs;
      };

      it('invokes crypto.timingSafeEqual for tokens with matching lengths', async () => {
        const config: InboundBearerAuthConfig = {
          type: 'bearer',
          tokens: ['valid-token-12345'],
        };

        const validator = new BearerTokenValidator(config);

        const validContext = {
          req: {
            header: () => 'Bearer valid-token-12345',
          },
        } satisfies MockContext;

        const timingSpy = timingSafeEqualSpy;

        timingSpy.mockClear();
        const validResult = await validator.validateRequest(validContext);
        expect(validResult.isAuthenticated).toBe(true);
        expect(timingSpy).toHaveBeenCalledTimes(1);

        const invalidContext = {
          req: {
            header: () => 'Bearer valid-token-1234x',
          },
        } satisfies MockContext;

        timingSpy.mockClear();
        const invalidResult = await validator.validateRequest(invalidContext);
        expect(invalidResult.isAuthenticated).toBe(false);
        expect(invalidResult.error).toBe('Invalid Bearer token');
        expect(timingSpy).toHaveBeenCalledTimes(1);
      });

      it('maintains consistent timing for same-length mismatches', async () => {
        const config: InboundBearerAuthConfig = {
          type: 'bearer',
          tokens: ['secret-token-abcdefg'],
        };

        const validator = new BearerTokenValidator(config);
        const runs = 6000;

        const mismatchedHeaders = [
          'Bearer tecret-token-abcdefg',
          'Bearer secret-tokon-abcdefg',
          'Bearer secret-token-abcdefh',
        ];

        const samples: number[] = [];

        const timingSpy = timingSafeEqualSpy;

        for (const header of mismatchedHeaders) {
          timingSpy.mockClear();
          const averageNanoseconds = await measureAverageNanoseconds(
            validator,
            header,
            runs,
          );

          samples.push(averageNanoseconds);
          expect(timingSpy).toHaveBeenCalledTimes(runs);
        }

        const maxSample = Math.max(...samples);
        const minSample = Math.min(...samples);
        const variance = maxSample - minSample;
        // Allow up to 50 microseconds (50,000 nanoseconds) variance
        // This accounts for JS runtime noise while still detecting timing attacks
        // which typically show millisecond-level (1,000,000+ nanoseconds) differences
        const allowedVarianceNanoseconds = 50_000;

        expect(variance).toBeLessThanOrEqual(allowedVarianceNanoseconds);
      });

      it('keeps different-length mismatches within bounded timing variance', async () => {
        const config: InboundBearerAuthConfig = {
          type: 'bearer',
          tokens: ['secret-token-abcdefg'],
        };

        const validator = new BearerTokenValidator(config);
        const runs = 6000;

        const mismatchedHeaders = [
          'Bearer short',
          'Bearer medium-length-token',
          'Bearer secret-token-abcdefg-extra-content',
        ];

        const samples = await Promise.all(
          mismatchedHeaders.map((header) =>
            measureAverageNanoseconds(validator, header, runs),
          ),
        );

        const maxSample = Math.max(...samples);
        const minSample = Math.min(...samples);
        const variance = maxSample - minSample;
        // Allow up to 50 microseconds (50,000 nanoseconds) variance for different length tokens
        // Length differences don't reveal secrets, so slightly higher variance is acceptable
        expect(variance).toBeLessThanOrEqual(50_000);
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
