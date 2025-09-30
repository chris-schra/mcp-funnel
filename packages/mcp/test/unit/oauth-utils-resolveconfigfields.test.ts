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


describe('OAuth Utils - resolveConfigFields', () => {
  it('should resolve environment variables in config', () => {
    process.env.TEST_VAR = 'resolved-value';
    process.env.ANOTHER_VAR = 'another-resolved';

    const config = {
      field1: '${TEST_VAR}',
      field2: '${ANOTHER_VAR}',
      field3: 'literal-value',
    };

    const result = resolveConfigFields(config, ['field1', 'field2']);

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

    const result = resolveConfigFields(config, [
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

    const result = resolveConfigFields(config, ['resolveThis']);

    expect(result).toEqual({
      resolveThis: 'resolved',
      ignoreThis: '${IGNORED_VAR}',
    });
  });

  it('should throw error for undefined environment variables', () => {
    const config = {
      field1: '${UNDEFINED_VAR}',
    };
    expect(() => resolveConfigFields(config, ['field1'])).toThrow(
      "Required environment variable 'UNDEFINED_VAR' is not defined",
    );
  });
});
