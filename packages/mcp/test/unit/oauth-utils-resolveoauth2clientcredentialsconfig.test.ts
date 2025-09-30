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


describe('OAuth Utils - resolveOAuth2ClientCredentialsConfig', () => {
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
