/**
 * OAuth2 Authorization URL building utilities
 * Pure functions for constructing authorization URLs
 */
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';

/**
 * Parameters for building an OAuth2 authorization URL with PKCE.
 * @public
 * @see file:./pkce.ts - PKCE utility functions
 */
export interface AuthUrlParams {
  /** OAuth2 Authorization Code configuration including endpoints and client details */
  config: OAuth2AuthCodeConfig;
  /** Random state parameter for CSRF protection */
  state: string;
  /** PKCE code challenge derived from the code verifier */
  codeChallenge: string;
}

/**
 * Builds an OAuth2 authorization URL with PKCE parameters.
 *
 * Constructs a complete authorization URL following RFC 6749 (OAuth2) and RFC 7636 (PKCE).
 * The URL includes all required OAuth2 parameters plus PKCE challenge for enhanced security.
 * Optional scope and audience parameters are included if present in the configuration.
 * @param params - Authorization URL parameters including config, state, and PKCE challenge
 * @returns Complete authorization URL ready for browser redirect
 * @example
 * ```typescript
 * const authUrl = buildAuthorizationUrl({
 *   config: {
 *     authorizationEndpoint: 'https://auth.example.com/authorize',
 *     clientId: 'my-client-id',
 *     redirectUri: 'http://localhost:3000/callback',
 *     scope: 'openid profile'
 *   },
 *   state: 'random-state-value',
 *   codeChallenge: 'base64url-encoded-challenge'
 * });
 * // Returns: https://auth.example.com/authorize?response_type=code&client_id=...
 * ```
 * @public
 * @see file:./pkce.ts:22 - generateCodeChallenge for creating the challenge
 * @see file:../implementations/oauth2-authorization-code.ts:347 - Usage in OAuth2 flow
 */
export function buildAuthorizationUrl(params: AuthUrlParams): URL {
  const { config, state, codeChallenge } = params;

  const authUrl = new URL(config.authorizationEndpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  if (config.scope) {
    authUrl.searchParams.set('scope', config.scope);
  }

  if (config.audience) {
    authUrl.searchParams.set('audience', config.audience);
  }

  return authUrl;
}
