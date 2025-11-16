/**
 * OAuth2 Token Exchange utilities
 * Pure functions for exchanging authorization codes for tokens
 */
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import type { OAuth2TokenResponse } from './oauth-types.js';

export interface TokenExchangeParams {
  config: OAuth2AuthCodeConfig;
  code: string;
  codeVerifier: string;
}

/**
 * Build token exchange request body
 *
 * Constructs URL-encoded form data for OAuth2 authorization code token exchange,
 * including PKCE code verifier per RFC 7636.
 * @param params - Token exchange parameters
 * @returns URL-encoded request body with grant_type, code, redirect_uri, client_id, and code_verifier
 * @internal
 * @see file:./token-exchange.ts:8-12 - TokenExchangeParams interface
 * @see file:../implementations/oauth2-authorization-code.ts:392 - Usage in OAuth2 flow
 */
export function buildTokenExchangeBody(params: TokenExchangeParams): URLSearchParams {
  const { config, code, codeVerifier } = params;

  return new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });
}

/**
 * Build token exchange request headers
 *
 * Constructs HTTP headers for token exchange request with optional HTTP Basic
 * authentication when client secret is available.
 * @param config - OAuth2 authorization code configuration
 * @returns HTTP headers with Content-Type and optional Authorization header
 * @internal
 * @see file:../implementations/oauth2-authorization-code.ts:398 - Usage in OAuth2 flow
 */
export function buildTokenExchangeHeaders(config: OAuth2AuthCodeConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Add client authentication if client secret is provided
  if (config.clientSecret) {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    headers.Authorization = `Basic ${credentials}`;
  }

  return headers;
}

/**
 * Execute token exchange request
 *
 * Exchanges an authorization code for access and refresh tokens by making
 * a POST request to the token endpoint with PKCE verification.
 * @param params - Token exchange parameters including code and code verifier
 * @returns Promise resolving to OAuth2 token response with access_token and optional refresh_token
 * @throws When token exchange request fails (non-2xx response)
 * @public
 * @see file:./oauth-types.ts:4-11 - OAuth2TokenResponse interface
 * @see file:./token-exchange.ts:18 - buildTokenExchangeBody helper
 * @see file:./token-exchange.ts:36 - buildTokenExchangeHeaders helper
 */
export async function exchangeCodeForToken(
  params: TokenExchangeParams,
): Promise<OAuth2TokenResponse> {
  const body = buildTokenExchangeBody(params);
  const headers = buildTokenExchangeHeaders(params.config);

  const response = await fetch(params.config.tokenEndpoint, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return (await response.json()) as OAuth2TokenResponse;
}
