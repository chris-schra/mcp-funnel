import type { OAuth2TokenResponse } from '../oauth-types.js';
import { AUTH_DEFAULT_EXPIRY_SECONDS } from '../oauth-types.js';
import type { TokenData } from '@mcp-funnel/core';

/**
 * Parses OAuth2 token response into TokenData.
 *
 * Converts an OAuth2 token response from an authorization server into
 * the standard TokenData format used internally. Handles missing fields
 * by applying sensible defaults (e.g., 'Bearer' for token_type).
 * @param tokenResponse - OAuth2 token response from the authorization server
 * @param defaultExpirySeconds - Default expiration time in seconds if expires_in is not provided (defaults to 3600)
 * @returns TokenData object with accessToken, expiresAt, tokenType, and optional scope
 * @public
 * @see file:../oauth-types.ts - OAuth2TokenResponse interface definition
 * @see file:@mcp-funnel/core/src/auth/index.d.ts - TokenData interface definition
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
