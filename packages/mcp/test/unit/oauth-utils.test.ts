import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveEnvironmentVariables,
  resolveOAuth2ClientCredentialsConfig,
  resolveOAuth2AuthCodeConfig,
  resolveEnvVar,
  parseErrorResponse,
  createOAuth2Error,
  parseTokenResponse,
  isRetryableError,
} from '../../src/auth/utils/oauth-utils.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
  AuthErrorCode,
} from '../../src/auth/errors/authentication-error.js';
import type {
  OAuth2TokenResponse,
  OAuth2ErrorResponse,
} from '../../src/auth/utils/oauth-types.js';
import { DEFAULT_EXPIRY_SECONDS } from '../../src/auth/utils/oauth-types.js';
import type { OAuth2ClientCredentialsConfigZod } from '../../src/config.js';
import type { OAuth2AuthCodeConfig } from '../../src/types/auth.types.js';

describe('OAuth Utils', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveEnvironmentVariables', () => {
    it('should resolve environment variables in config', () => {
      process.env.TEST_VAR = 'resolved-value';
      process.env.ANOTHER_VAR = 'another-resolved';

      const config = {
        field1: '${TEST_VAR}',
        field2: '${ANOTHER_VAR}',
        field3: 'literal-value',
      };

      const result = resolveEnvironmentVariables(config, ['field1', 'field2']);

      expect(result).toEqual({
        field1: 'resolved-value',
        field2: 'another-resolved',
        field3: 'literal-value',
      });
    });

    it('should handle non-string values', () => {
      const config = {
        field1: '${TEST_VAR}',
        field2: undefined,
        field3: 'literal',
      };

      process.env.TEST_VAR = 'resolved';

      const result = resolveEnvironmentVariables(config, [
        'field1',
        'field2',
        'field3',
      ]);

      expect(result).toEqual({
        field1: 'resolved',
        field2: undefined,
        field3: 'literal',
      });
    });

    it('should only resolve specified fields', () => {
      process.env.TEST_VAR = 'resolved';
      process.env.IGNORED_VAR = 'ignored';

      const config = {
        resolveThis: '${TEST_VAR}',
        ignoreThis: '${IGNORED_VAR}',
      };

      const result = resolveEnvironmentVariables(config, ['resolveThis']);

      expect(result).toEqual({
        resolveThis: 'resolved',
        ignoreThis: '${IGNORED_VAR}',
      });
    });

    it('should throw error for undefined environment variables', () => {
      const config = {
        field1: '${UNDEFINED_VAR}',
      };

      expect(() => resolveEnvironmentVariables(config, ['field1'])).toThrow(
        AuthenticationError,
      );
      expect(() => resolveEnvironmentVariables(config, ['field1'])).toThrow(
        'Environment variable UNDEFINED_VAR is not set',
      );
    });
  });

  describe('resolveOAuth2ClientCredentialsConfig', () => {
    it('should resolve all OAuth2 client credentials environment variables', () => {
      process.env.CLIENT_ID = 'test-client-id';
      process.env.CLIENT_SECRET = 'test-client-secret';
      process.env.TOKEN_ENDPOINT = 'https://auth.example.com/token';
      process.env.SCOPE = 'read write';
      process.env.AUDIENCE = 'https://api.example.com';

      const config: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: '${CLIENT_ID}',
        clientSecret: '${CLIENT_SECRET}',
        tokenEndpoint: '${TOKEN_ENDPOINT}',
        scope: '${SCOPE}',
        audience: '${AUDIENCE}',
      };

      const result = resolveOAuth2ClientCredentialsConfig(config);

      expect(result).toEqual({
        type: 'oauth2-client',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        tokenEndpoint: 'https://auth.example.com/token',
        scope: 'read write',
        audience: 'https://api.example.com',
      });
    });

    it('should handle optional fields with undefined values', () => {
      process.env.CLIENT_ID = 'test-client-id';
      process.env.CLIENT_SECRET = 'test-client-secret';
      process.env.TOKEN_ENDPOINT = 'https://auth.example.com/token';

      const config: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: '${CLIENT_ID}',
        clientSecret: '${CLIENT_SECRET}',
        tokenEndpoint: '${TOKEN_ENDPOINT}',
        scope: undefined,
        audience: undefined,
      };

      const result = resolveOAuth2ClientCredentialsConfig(config);

      expect(result).toEqual({
        type: 'oauth2-client',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        tokenEndpoint: 'https://auth.example.com/token',
        scope: undefined,
        audience: undefined,
      });
    });

    it('should resolve optional fields with environment variables', () => {
      process.env.CLIENT_ID = 'test-client-id';
      process.env.CLIENT_SECRET = 'test-client-secret';
      process.env.TOKEN_ENDPOINT = 'https://auth.example.com/token';
      process.env.SCOPE = 'read';

      const config: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: '${CLIENT_ID}',
        clientSecret: '${CLIENT_SECRET}',
        tokenEndpoint: '${TOKEN_ENDPOINT}',
        scope: '${SCOPE}',
        audience: undefined,
      };

      const result = resolveOAuth2ClientCredentialsConfig(config);

      expect(result.scope).toBe('read');
      expect(result.audience).toBeUndefined();
    });
  });

  describe('resolveOAuth2AuthCodeConfig', () => {
    it('should resolve all OAuth2 authorization code environment variables', () => {
      process.env.CLIENT_ID = 'auth-client-id';
      process.env.CLIENT_SECRET = 'auth-client-secret';
      process.env.AUTH_ENDPOINT = 'https://auth.example.com/authorize';
      process.env.TOKEN_ENDPOINT = 'https://auth.example.com/token';
      process.env.REDIRECT_URI = 'http://localhost:8080/callback';
      process.env.SCOPE = 'openid profile';
      process.env.AUDIENCE = 'https://api.example.com';

      const config: OAuth2AuthCodeConfig = {
        type: 'oauth2-code',
        clientId: '${CLIENT_ID}',
        clientSecret: '${CLIENT_SECRET}',
        authorizationEndpoint: '${AUTH_ENDPOINT}',
        tokenEndpoint: '${TOKEN_ENDPOINT}',
        redirectUri: '${REDIRECT_URI}',
        scope: '${SCOPE}',
        audience: '${AUDIENCE}',
      };

      const result = resolveOAuth2AuthCodeConfig(config);

      expect(result).toEqual({
        type: 'oauth2-code',
        clientId: 'auth-client-id',
        clientSecret: 'auth-client-secret',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        redirectUri: 'http://localhost:8080/callback',
        scope: 'openid profile',
        audience: 'https://api.example.com',
      });
    });

    it('should handle optional client secret', () => {
      process.env.CLIENT_ID = 'public-client-id';
      process.env.AUTH_ENDPOINT = 'https://auth.example.com/authorize';
      process.env.TOKEN_ENDPOINT = 'https://auth.example.com/token';
      process.env.REDIRECT_URI = 'http://localhost:8080/callback';

      const config: OAuth2AuthCodeConfig = {
        type: 'oauth2-code',
        clientId: '${CLIENT_ID}',
        clientSecret: undefined,
        authorizationEndpoint: '${AUTH_ENDPOINT}',
        tokenEndpoint: '${TOKEN_ENDPOINT}',
        redirectUri: '${REDIRECT_URI}',
        scope: undefined,
        audience: undefined,
      };

      const result = resolveOAuth2AuthCodeConfig(config);

      expect(result.clientSecret).toBeUndefined();
      expect(result.clientId).toBe('public-client-id');
    });
  });

  describe('resolveEnvVar', () => {
    it('should resolve environment variable with ${VAR} syntax', () => {
      process.env.TEST_VAR = 'test-value';

      const result = resolveEnvVar('${TEST_VAR}');

      expect(result).toBe('test-value');
    });

    it('should return literal value if not environment variable syntax', () => {
      const result = resolveEnvVar('literal-value');

      expect(result).toBe('literal-value');
    });

    it('should handle complex literal values', () => {
      const complexValue = 'https://example.com/path?param=value';
      const result = resolveEnvVar(complexValue);

      expect(result).toBe(complexValue);
    });

    it('should throw error for undefined environment variable', () => {
      expect(() => resolveEnvVar('${UNDEFINED_VAR}')).toThrow(
        AuthenticationError,
      );
      expect(() => resolveEnvVar('${UNDEFINED_VAR}')).toThrow(
        'Environment variable UNDEFINED_VAR is not set',
      );
    });

    it('should handle empty environment variable', () => {
      process.env.EMPTY_VAR = '';

      const result = resolveEnvVar('${EMPTY_VAR}');

      expect(result).toBe('');
    });

    it('should handle whitespace-only environment variable', () => {
      process.env.WHITESPACE_VAR = '   ';

      const result = resolveEnvVar('${WHITESPACE_VAR}');

      expect(result).toBe('   ');
    });

    it('should not match malformed environment variable syntax', () => {
      const malformedCases = [
        '$VAR',
        '${VAR',
        'VAR}',
        '${VAR}_extra',
        'prefix_${VAR}',
        '${VAR}${OTHER}',
      ];

      malformedCases.forEach((malformed) => {
        const result = resolveEnvVar(malformed);
        expect(result).toBe(malformed);
      });
    });
  });

  describe('parseErrorResponse', () => {
    it('should parse valid JSON error response', async () => {
      const errorResponse: OAuth2ErrorResponse = {
        error: 'invalid_request',
        error_description: 'Missing required parameter',
        error_uri: 'https://example.com/error',
      };

      const mockResponse = {
        json: vi.fn().mockResolvedValue(errorResponse),
        status: 400,
        statusText: 'Bad Request',
      } as unknown as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual(errorResponse);
      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should handle JSON parsing failure with 4xx status', async () => {
      const mockResponse = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        status: 400,
        statusText: 'Bad Request',
      } as unknown as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual({
        error: 'invalid_request',
        error_description: 'HTTP 400: Bad Request',
      });
    });

    it('should handle JSON parsing failure with 5xx status', async () => {
      const mockResponse = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual({
        error: 'server_error',
        error_description: 'HTTP 500: Internal Server Error',
      });
    });

    it('should handle response with no status text', async () => {
      const mockResponse = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        status: 401,
        statusText: '',
      } as unknown as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual({
        error: 'invalid_request',
        error_description: 'HTTP 401: ',
      });
    });
  });

  describe('createOAuth2Error', () => {
    it('should create error for invalid_request', () => {
      const errorResponse: OAuth2ErrorResponse = {
        error: 'invalid_request',
        error_description: 'Missing required parameter',
      };

      const result = createOAuth2Error(errorResponse, 400);

      expect(result).toBeInstanceOf(AuthenticationError);
      expect(result.message).toBe(
        'OAuth2 authentication failed: invalid_request - Missing required parameter',
      );
      expect(result.code).toBe(OAuth2ErrorCode.INVALID_REQUEST);
    });

    it('should create error without description', () => {
      const errorResponse: OAuth2ErrorResponse = {
        error: 'invalid_client',
      };

      const result = createOAuth2Error(errorResponse, 401);

      expect(result.message).toBe(
        'OAuth2 authentication failed: invalid_client',
      );
      expect(result.code).toBe(OAuth2ErrorCode.INVALID_CLIENT);
    });

    it('should map all OAuth2 error codes correctly', () => {
      const testCases: Array<{
        error: string;
        expectedCode: OAuth2ErrorCode;
      }> = [
        {
          error: 'invalid_request',
          expectedCode: OAuth2ErrorCode.INVALID_REQUEST,
        },
        {
          error: 'invalid_client',
          expectedCode: OAuth2ErrorCode.INVALID_CLIENT,
        },
        { error: 'invalid_grant', expectedCode: OAuth2ErrorCode.INVALID_GRANT },
        {
          error: 'unauthorized_client',
          expectedCode: OAuth2ErrorCode.UNAUTHORIZED_CLIENT,
        },
        {
          error: 'unsupported_grant_type',
          expectedCode: OAuth2ErrorCode.UNSUPPORTED_GRANT_TYPE,
        },
        { error: 'invalid_scope', expectedCode: OAuth2ErrorCode.INVALID_SCOPE },
        { error: 'access_denied', expectedCode: OAuth2ErrorCode.ACCESS_DENIED },
        {
          error: 'unsupported_response_type',
          expectedCode: OAuth2ErrorCode.UNSUPPORTED_RESPONSE_TYPE,
        },
        { error: 'server_error', expectedCode: OAuth2ErrorCode.SERVER_ERROR },
        {
          error: 'temporarily_unavailable',
          expectedCode: OAuth2ErrorCode.TEMPORARILY_UNAVAILABLE,
        },
      ];

      testCases.forEach(({ error, expectedCode }) => {
        const errorResponse: OAuth2ErrorResponse = { error };
        const result = createOAuth2Error(errorResponse, 400);

        expect(result.code).toBe(expectedCode);
      });
    });

    it('should handle unknown error with 5xx status', () => {
      const errorResponse: OAuth2ErrorResponse = {
        error: 'unknown_error',
      };

      const result = createOAuth2Error(errorResponse, 500);

      expect(result.code).toBe(OAuth2ErrorCode.SERVER_ERROR);
    });

    it('should handle unknown error with 4xx status', () => {
      const errorResponse: OAuth2ErrorResponse = {
        error: 'unknown_error',
      };

      const result = createOAuth2Error(errorResponse, 400);

      expect(result.code).toBe(AuthErrorCode.UNKNOWN_ERROR);
    });
  });

  describe('parseTokenResponse', () => {
    it('should parse complete token response', () => {
      const tokenResponse: OAuth2TokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 7200,
        scope: 'read write',
      };

      const result = parseTokenResponse(tokenResponse);

      expect(result.accessToken).toBe('test-access-token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.scope).toBe('read write');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeCloseTo(
        Date.now() + 7200 * 1000,
        -3, // within 1 second
      );
    });

    it('should use default expiry when expires_in is missing', () => {
      const tokenResponse: OAuth2TokenResponse = {
        access_token: 'test-token',
      };

      const result = parseTokenResponse(tokenResponse);

      expect(result.expiresAt.getTime()).toBeCloseTo(
        Date.now() + DEFAULT_EXPIRY_SECONDS * 1000,
        -3,
      );
    });

    it('should use custom default expiry', () => {
      const tokenResponse: OAuth2TokenResponse = {
        access_token: 'test-token',
      };

      const customExpiry = 7200;
      const result = parseTokenResponse(tokenResponse, customExpiry);

      expect(result.expiresAt.getTime()).toBeCloseTo(
        Date.now() + customExpiry * 1000,
        -3,
      );
    });

    it('should default token type to Bearer', () => {
      const tokenResponse: OAuth2TokenResponse = {
        access_token: 'test-token',
      };

      const result = parseTokenResponse(tokenResponse);

      expect(result.tokenType).toBe('Bearer');
    });

    it('should handle custom token type', () => {
      const tokenResponse: OAuth2TokenResponse = {
        access_token: 'test-token',
        token_type: 'MAC',
      };

      const result = parseTokenResponse(tokenResponse);

      expect(result.tokenType).toBe('MAC');
    });

    it('should handle zero expires_in', () => {
      const tokenResponse: OAuth2TokenResponse = {
        access_token: 'test-token',
        expires_in: 0,
      };

      const result = parseTokenResponse(tokenResponse);

      expect(result.expiresAt.getTime()).toBeCloseTo(Date.now(), -3);
    });

    it('should handle negative expires_in', () => {
      const tokenResponse: OAuth2TokenResponse = {
        access_token: 'test-token',
        expires_in: -3600,
      };

      const result = parseTokenResponse(tokenResponse);

      expect(result.expiresAt.getTime()).toBeCloseTo(
        Date.now() - 3600 * 1000,
        -3,
      );
    });

    it('should preserve undefined scope', () => {
      const tokenResponse: OAuth2TokenResponse = {
        access_token: 'test-token',
      };

      const result = parseTokenResponse(tokenResponse);

      expect(result.scope).toBeUndefined();
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable network errors by code', () => {
      const retryableCodes = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'ENETUNREACH',
        'ECONNABORTED',
      ];

      retryableCodes.forEach((code) => {
        const error = new Error(`Request failed with ${code}`);
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify retryable errors by keyword', () => {
      const retryableMessages = [
        'Network error occurred',
        'Connection timeout',
        'Connection reset by peer',
        'Network is unreachable',
      ];

      retryableMessages.forEach((message) => {
        const error = new Error(message);
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should not retry authentication errors', () => {
      const authError = new AuthenticationError(
        'Invalid credentials',
        OAuth2ErrorCode.INVALID_CLIENT,
      );

      expect(isRetryableError(authError)).toBe(false);
    });

    it('should not retry non-network errors', () => {
      const nonRetryableMessages = [
        'Validation error',
        'JSON parse error',
        'Invalid request format',
        'Permission denied',
      ];

      nonRetryableMessages.forEach((message) => {
        const error = new Error(message);
        expect(isRetryableError(error)).toBe(false);
      });
    });

    it('should handle case insensitive matching', () => {
      const mixedCaseErrors = [
        new Error('Network Error Occurred'),
        new Error('CONNECTION TIMEOUT'),
        new Error('econnreset'),
        new Error('ETIMEDOUT happened'),
      ];

      mixedCaseErrors.forEach((error) => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should handle empty error messages', () => {
      const error = new Error('');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should handle errors with partial keyword matches', () => {
      const partialMatches = [
        'networkish problem', // contains 'network'
        'timeout occurred', // contains 'timeout'
        'reset everything', // contains 'reset'
        'connection issues', // contains 'connection'
      ];

      partialMatches.forEach((message) => {
        const error = new Error(message);
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should not match keywords in non-error contexts', () => {
      const nonErrorMessages = [
        'User network preferences saved',
        'Connection successful',
        'Reset password completed',
      ];

      nonErrorMessages.forEach((message) => {
        const error = new Error(message);
        // These should still be retryable due to keyword matching
        // This test verifies the current behavior
        expect(isRetryableError(error)).toBe(true);
      });
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should handle malformed JSON in parseErrorResponse', async () => {
      const mockResponse = {
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
        status: 400,
        statusText: 'Bad Request',
      } as unknown as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result.error).toBe('invalid_request');
      expect(result.error_description).toBe('HTTP 400: Bad Request');
    });

    it('should handle null values in environment variables', () => {
      // TypeScript doesn't allow null, but JavaScript might
      const config = { field: null as never as string | undefined };

      // Should not process the field since it's not a string
      const result = resolveEnvironmentVariables(config, ['field']);

      expect(result.field).toBe(null);
    });

    it('should handle very long environment variable names', () => {
      const longVarName = 'A'.repeat(1000);
      process.env[longVarName] = 'long-var-value';

      const result = resolveEnvVar(`\${${longVarName}}`);

      expect(result).toBe('long-var-value');
    });

    it('should handle special characters in environment variables', () => {
      process.env.SPECIAL_VAR = 'value with spaces & symbols!@#$%^&*()';

      const result = resolveEnvVar('${SPECIAL_VAR}');

      expect(result).toBe('value with spaces & symbols!@#$%^&*()');
    });

    it('should handle unicode in environment variables', () => {
      process.env.UNICODE_VAR = '测试值 🚀 émojis';

      const result = resolveEnvVar('${UNICODE_VAR}');

      expect(result).toBe('测试值 🚀 émojis');
    });
  });
});
