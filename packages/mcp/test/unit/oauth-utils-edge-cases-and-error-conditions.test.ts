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


describe('OAuth Utils - Edge Cases and Error Conditions', () => {
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
    const result = resolveConfigFields(config, ['field']);

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
