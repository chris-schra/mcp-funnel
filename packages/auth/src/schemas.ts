/**
 * OAuth2 authentication configuration schemas with field normalization.
 *
 * Provides Zod schemas for validating and normalizing OAuth2 configuration
 * from various sources (config files, CLI args, etc.). Handles field name
 * variations (tokenUrl/tokenEndpoint, scope/scopes) transparently.
 *
 * @example
 * ```typescript
 * import { OAuth2ClientCredentialsConfigSchema } from './schemas.js';
 *
 * const config = OAuth2ClientCredentialsConfigSchema.parse({
 *   type: 'oauth2-client',
 *   clientId: 'my-client',
 *   clientSecret: 'secret',
 *   tokenUrl: 'https://auth.example.com/token', // normalized to tokenEndpoint
 *   scopes: ['read', 'write'] // normalized to 'read write'
 * });
 * ```
 *
 * @public
 */

import { z } from 'zod';

const OAuth2ClientCredentialsBaseSchema = z.object({
  type: z.literal('oauth2-client'),
  clientId: z.string(),
  clientSecret: z.string(),
  tokenEndpoint: z.string(),
  scope: z.string().optional(),
  audience: z.string().optional(),
});

/**
 * Zod schema for OAuth2 Client Credentials flow configuration.
 *
 * Validates and normalizes OAuth2 client credentials configuration with
 * automatic field name conversion:
 * - tokenUrl → tokenEndpoint
 * - scopes (array) → scope (space-separated string)
 *
 * @example
 * ```typescript
 * const config = OAuth2ClientCredentialsConfigSchema.parse({
 *   type: 'oauth2-client',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-secret',
 *   tokenUrl: 'https://auth.example.com/token',
 *   scopes: ['read', 'write']
 * });
 * // Result: { type, clientId, clientSecret, tokenEndpoint, scope: 'read write' }
 * ```
 *
 * @public
 * @see {@link OAuth2ClientCredentialsConfigZod}
 */
export const OAuth2ClientCredentialsConfigSchema = z.preprocess(
  (input: unknown) => {
    if (typeof input !== 'object' || input === null) return input;

    const result = { ...input } as Record<string, unknown>;

    // Handle tokenUrl/tokenEndpoint - prefer tokenEndpoint, convert tokenUrl to tokenEndpoint
    if (result.tokenEndpoint) {
      // Keep tokenEndpoint as-is, remove tokenUrl if it exists
      delete result.tokenUrl;
    } else if (result.tokenUrl) {
      result.tokenEndpoint = result.tokenUrl;
      delete result.tokenUrl;
    }

    // Handle scope/scopes - prefer scopes if both exist, convert array to string
    if (result.scopes) {
      if (Array.isArray(result.scopes)) {
        result.scope = result.scopes.join(' ');
      } else {
        result.scope = result.scopes;
      }
      delete result.scopes;
    }

    return result;
  },
  OAuth2ClientCredentialsBaseSchema,
);

// Base schema for OAuth2 authorization code
const OAuth2AuthCodeBaseSchema = z.object({
  type: z.literal('oauth2-code'),
  clientId: z.string(),
  clientSecret: z.string().optional(),
  authorizationEndpoint: z.string(),
  tokenEndpoint: z.string(),
  redirectUri: z.string(),
  scope: z.string().optional(),
  audience: z.string().optional(),
});

/**
 * Zod schema for OAuth2 Authorization Code flow configuration.
 *
 * Validates and normalizes OAuth2 authorization code flow configuration with
 * automatic field name conversion:
 * - authUrl → authorizationEndpoint
 * - tokenUrl → tokenEndpoint
 * - scopes (array) → scope (space-separated string)
 *
 * @example
 * ```typescript
 * const config = OAuth2AuthCodeConfigSchema.parse({
 *   type: 'oauth2-code',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-secret',
 *   authUrl: 'https://auth.example.com/authorize',
 *   tokenUrl: 'https://auth.example.com/token',
 *   redirectUri: 'http://localhost:3000/callback',
 *   scopes: ['openid', 'profile']
 * });
 * // Result: normalized with authorizationEndpoint, tokenEndpoint, scope
 * ```
 *
 * @public
 * @see {@link OAuth2AuthCodeConfigZod}
 */
export const OAuth2AuthCodeConfigSchema = z.preprocess((input: unknown) => {
  if (typeof input !== 'object' || input === null) return input;

  const result = { ...input } as Record<string, unknown>;

  // Handle authUrl/authorizationEndpoint - prefer authorizationEndpoint, convert authUrl to authorizationEndpoint
  if (result.authorizationEndpoint) {
    // Keep authorizationEndpoint as-is, remove authUrl if it exists
    delete result.authUrl;
  } else if (result.authUrl) {
    result.authorizationEndpoint = result.authUrl;
    delete result.authUrl;
  }

  // Handle tokenUrl/tokenEndpoint - prefer tokenEndpoint, convert tokenUrl to tokenEndpoint
  if (result.tokenEndpoint) {
    // Keep tokenEndpoint as-is, remove tokenUrl if it exists
    delete result.tokenUrl;
  } else if (result.tokenUrl) {
    result.tokenEndpoint = result.tokenUrl;
    delete result.tokenUrl;
  }

  // Handle scope/scopes - prefer scopes if both exist, convert array to string
  if (result.scopes) {
    if (Array.isArray(result.scopes)) {
      result.scope = result.scopes.join(' ');
    } else {
      result.scope = result.scopes;
    }
    delete result.scopes;
  }

  return result;
}, OAuth2AuthCodeBaseSchema);

/**
 * TypeScript type inferred from OAuth2ClientCredentialsConfigSchema.
 *
 * @public
 * @see {@link OAuth2ClientCredentialsConfigSchema}
 */
export type OAuth2ClientCredentialsConfigZod = z.infer<
  typeof OAuth2ClientCredentialsConfigSchema
>;

/**
 * TypeScript type inferred from OAuth2AuthCodeConfigSchema.
 *
 * @public
 * @see {@link OAuth2AuthCodeConfigSchema}
 */
export type OAuth2AuthCodeConfigZod = z.infer<
  typeof OAuth2AuthCodeConfigSchema
>;
