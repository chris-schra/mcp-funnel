import { describe, it, expect, afterEach, vi, type Mock } from 'vitest';
type CryptoModule = typeof import('crypto');
type TimingSafeEqualFn = CryptoModule['timingSafeEqual'];

const timingSafeEqualSpy: Mock<TimingSafeEqualFn> = vi.hoisted(() => vi.fn<TimingSafeEqualFn>());

vi.mock('crypto', async () => {
  const actual = await vi.importActual<CryptoModule>('crypto');

  timingSafeEqualSpy.mockImplementation((...args: Parameters<TimingSafeEqualFn>) =>
    actual.timingSafeEqual(...args),
  );

  return {
    ...actual,
    timingSafeEqual: timingSafeEqualSpy,
  };
});

import { BearerTokenValidator, type InboundBearerAuthConfig } from '../../src/auth/index.js';
import { createMockContext } from './test-utils.js';

afterEach(() => {
  timingSafeEqualSpy.mockClear();
});

describe('BearerTokenValidator', () => {
  it('should validate correct bearer tokens', async () => {
    const config: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['valid-token-123', 'another-valid-token'],
    };

    const validator = new BearerTokenValidator(config);

    const mockContext = createMockContext(vi.fn().mockReturnValue('Bearer valid-token-123'));

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

    const mockContext = createMockContext(vi.fn().mockReturnValue('Bearer invalid-token'));

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

    const mockContext = createMockContext(vi.fn().mockReturnValue(undefined));

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

    const mockContext = createMockContext(
      vi.fn().mockReturnValue('Basic dXNlcjpwYXNz'), // Basic auth instead of Bearer
    );

    const result = await validator.validateRequest(mockContext);

    expect(result.isAuthenticated).toBe(false);
    expect(result.error).toBe('Invalid Authorization header format. Expected: Bearer <token>');
  });

  it('should reject empty bearer token', async () => {
    const config: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['valid-token-123'],
    };

    const validator = new BearerTokenValidator(config);

    const mockContext = createMockContext(vi.fn().mockReturnValue('Bearer '));

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
      const context = createMockContext(() => headerValue);

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

      const validContext = createMockContext(() => 'Bearer valid-token-12345');

      const timingSpy = timingSafeEqualSpy;

      timingSpy.mockClear();
      const validResult = await validator.validateRequest(validContext);
      expect(validResult.isAuthenticated).toBe(true);
      expect(timingSpy).toHaveBeenCalledTimes(1);

      const invalidContext = createMockContext(() => 'Bearer valid-token-1234x');

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
        const averageNanoseconds = await measureAverageNanoseconds(validator, header, runs);

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
        mismatchedHeaders.map((header) => measureAverageNanoseconds(validator, header, runs)),
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
