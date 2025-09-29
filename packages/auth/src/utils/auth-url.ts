/**
 * OAuth2 Authorization URL building utilities
 * Pure functions for constructing authorization URLs
 */
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';

export interface AuthUrlParams {
  config: OAuth2AuthCodeConfig;
  state: string;
  codeChallenge: string;
}

/**
 * Build authorization URL with PKCE
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
