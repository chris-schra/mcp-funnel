import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import type { OAuth2ClientCredentialsConfigZod } from '../schemas.js';
import { resolveEnvVar } from '@mcp-funnel/core';

/**
 * Resolves environment variable references in OAuth2 Authorization Code configuration
 *
 * Processes all string fields in the config to resolve environment variable patterns
 * (e.g., `\$\{ENV_VAR\}` or `$ENV_VAR`) to their actual values. String fields that don't
 * contain environment variable patterns are returned unchanged. Optional fields that
 * are undefined are preserved as undefined.
 * @param config - OAuth2 Authorization Code configuration with potential env var references
 * @returns New config object with all environment variables resolved
 * @throws When a referenced environment variable is not defined or resolution fails
 * @example
 * ```typescript
 * const config = {
 *   type: 'oauth2-code',
 *   clientId: '\$\{OAUTH_CLIENT_ID\}',
 *   authorizationEndpoint: 'https://oauth.example.com/authorize',
 *   tokenEndpoint: '\$\{OAUTH_TOKEN_URL\}',
 *   redirectUri: 'http://localhost:3000/callback',
 *   scope: 'read write'
 * };
 *
 * const resolved = resolveOAuth2AuthCodeConfig(config);
 * // resolved.clientId now contains the actual value from OAUTH_CLIENT_ID env var
 * // resolved.tokenEndpoint now contains the actual value from OAUTH_TOKEN_URL env var
 * ```
 * @public
 * @see {@link OAuth2AuthCodeProvider}
 */
export function resolveOAuth2AuthCodeConfig(config: OAuth2AuthCodeConfig): OAuth2AuthCodeConfig {
  return {
    ...config,
    clientId: resolveEnvVar(config.clientId),
    clientSecret: config.clientSecret ? resolveEnvVar(config.clientSecret) : config.clientSecret,
    authorizationEndpoint: resolveEnvVar(config.authorizationEndpoint),
    tokenEndpoint: resolveEnvVar(config.tokenEndpoint),
    redirectUri: resolveEnvVar(config.redirectUri),
    scope: config.scope ? resolveEnvVar(config.scope) : config.scope,
    audience: config.audience ? resolveEnvVar(config.audience) : config.audience,
  };
}

/**
 * Resolves environment variable references in OAuth2 Client Credentials configuration
 *
 * Processes all string fields in the config to resolve environment variable patterns
 * (e.g., `\$\{ENV_VAR\}` or `$ENV_VAR`) to their actual values. String fields that don't
 * contain environment variable patterns are returned unchanged. Optional fields that
 * are undefined are preserved as undefined.
 * @param config - OAuth2 Client Credentials configuration with potential env var references
 * @returns New config object with all environment variables resolved
 * @throws When a referenced environment variable is not defined or resolution fails
 * @example
 * ```typescript
 * const config = {
 *   type: 'oauth2-client',
 *   clientId: '\$\{OAUTH_CLIENT_ID\}',
 *   clientSecret: '\$\{OAUTH_CLIENT_SECRET\}',
 *   tokenEndpoint: '\$\{OAUTH_TOKEN_URL\}',
 *   scope: 'api:read api:write'
 * };
 *
 * const resolved = resolveOAuth2ClientCredentialsConfig(config);
 * // resolved.clientId now contains the actual value from OAUTH_CLIENT_ID env var
 * // resolved.clientSecret now contains the actual value from OAUTH_CLIENT_SECRET env var
 * ```
 * @public
 * @see {@link OAuth2ClientCredentialsProvider}
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
    audience: config.audience ? resolveEnvVar(config.audience) : config.audience,
  };
}
