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
 */
export function buildTokenExchangeBody(
  params: TokenExchangeParams,
): URLSearchParams {
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
 */
export function buildTokenExchangeHeaders(
  config: OAuth2AuthCodeConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Add client authentication if client secret is provided
  if (config.clientSecret) {
    const credentials = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString('base64');
    headers.Authorization = `Basic ${credentials}`;
  }

  return headers;
}

/**
 * Execute token exchange request
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
