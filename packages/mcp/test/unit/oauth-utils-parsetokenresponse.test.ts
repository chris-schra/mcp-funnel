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


describe('OAuth Utils - parseTokenResponse', () => {
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
      Date.now() + AUTH_DEFAULT_EXPIRY_SECONDS * 1000,
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
