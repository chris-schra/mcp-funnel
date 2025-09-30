import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import type { OAuth2ClientCredentialsConfigZod } from '../schemas.js';
import { resolveEnvVar } from '@mcp-funnel/core';

/**
 * Specific resolver for OAuth2 Authorization Code config
 */
export function resolveOAuth2AuthCodeConfig(
  config: OAuth2AuthCodeConfig,
): OAuth2AuthCodeConfig {
  return {
    ...config,
    clientId: resolveEnvVar(config.clientId),
    clientSecret: config.clientSecret
      ? resolveEnvVar(config.clientSecret)
      : config.clientSecret,
    authorizationEndpoint: resolveEnvVar(config.authorizationEndpoint),
    tokenEndpoint: resolveEnvVar(config.tokenEndpoint),
    redirectUri: resolveEnvVar(config.redirectUri),
    scope: config.scope ? resolveEnvVar(config.scope) : config.scope,
    audience: config.audience
      ? resolveEnvVar(config.audience)
      : config.audience,
  };
}

/**
 * Specific resolver for OAuth2 Client Credentials config
 */
export function resolveOAuth2ClientCredentialsConfig(
  config: OAuth2ClientCredentialsConfigZod,
): OAuth2ClientCredentialsConfigZod {
  return {
    ...config,
    clientId: resolveEnvVar(config.clientId),
    clientSecret: resolveEnvVar(config.clientSecret),
    tokenEndpoint: resolveEnvVar(config.tokenEndpoint),
    scope: config.scope ? resolveEnvVar(config.scope) : config.scope,
    audience: config.audience
      ? resolveEnvVar(config.audience)
      : config.audience,
  };
}
