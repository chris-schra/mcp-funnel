import type { OAuth2TokenResponse } from '../oauth-types.js';
import { AUTH_DEFAULT_EXPIRY_SECONDS } from '../oauth-types.js';
import type { TokenData } from '@mcp-funnel/core';

/**
 * Parses OAuth2 token response into TokenData
 */
export function parseTokenResponse(
  tokenResponse: OAuth2TokenResponse,
  defaultExpirySeconds: number = AUTH_DEFAULT_EXPIRY_SECONDS,
): TokenData {
  const expiresIn = tokenResponse.expires_in ?? defaultExpirySeconds;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const tokenType = tokenResponse.token_type ?? 'Bearer';

  return {
    accessToken: tokenResponse.access_token,
    expiresAt,
    tokenType,
    scope: tokenResponse.scope,
  };
}
