import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import {
  AUTH_DEFAULT_EXPIRY_SECONDS,
  AuthenticationError,
  AuthErrorCode,
  type OAuth2ClientCredentialsConfigZod,
  OAuth2ErrorCode,
  OAuth2ErrorResponse,
  type OAuth2TokenResponse,
  OAuthUtils,
  resolveOAuth2AuthCodeConfig,
  resolveOAuth2ClientCredentialsConfig,
} from '@mcp-funnel/auth';
import { resolveConfigFields, resolveEnvVar } from '@mcp-funnel/core';

const {
  parseErrorResponse,
  parseTokenResponse,
  isRetryableError,
  createOAuth2Error,
} = OAuthUtils;


describe('OAuth Utils - resolveEnvVar', () => {
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
      "Required environment variable 'UNDEFINED_VAR' is not defined",
    );
    expect(() => resolveEnvVar('${UNDEFINED_VAR}')).toThrow(
      "Required environment variable 'UNDEFINED_VAR' is not defined",
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
    const malformedCases = ['$VAR', '${VAR', 'VAR}'];

    malformedCases.forEach((malformed) => {
      const result = resolveEnvVar(malformed);
      expect(result).toBe(malformed);
    });
  });

  it('should throw for valid patterns with undefined environment variables', () => {
    const validPatternsWithUndefinedVars = [
      '${VAR}_extra',
      'prefix_${VAR}',
      '${VAR}${OTHER}',
    ];

    validPatternsWithUndefinedVars.forEach((pattern) => {
      expect(() => resolveEnvVar(pattern)).toThrow(
        "Required environment variable 'VAR' is not defined",
      );
    });
  });
});
