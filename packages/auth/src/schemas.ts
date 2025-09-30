// Base schema for OAuth2 client credentials
import { z } from 'zod';

const OAuth2ClientCredentialsBaseSchema = z.object({
  type: z.literal('oauth2-client'),
  clientId: z.string(),
  clientSecret: z.string(),
  tokenEndpoint: z.string(),
  scope: z.string().optional(),
  audience: z.string().optional(),
});

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

export type OAuth2ClientCredentialsConfigZod = z.infer<
  typeof OAuth2ClientCredentialsConfigSchema
>;
export type OAuth2AuthCodeConfigZod = z.infer<
  typeof OAuth2AuthCodeConfigSchema
>;
