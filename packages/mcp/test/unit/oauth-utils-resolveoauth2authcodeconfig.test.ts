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

describe('OAuth Utils - resolveOAuth2AuthCodeConfig', () => {
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
