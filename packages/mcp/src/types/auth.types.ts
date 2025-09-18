/**
 * Authentication configuration types for MCP OAuth implementation.
 * These types define the discriminated unions for different authentication methods.
 */

/**
 * No authentication - for servers that don't require authentication
 */
export interface NoAuthConfig {
  type: 'none';
}

/**
 * Static bearer token authentication
 */
export interface BearerAuthConfig {
  type: 'bearer';
  token: string;
}

/**
 * OAuth2 client credentials flow authentication
 */
export interface OAuth2ClientCredentialsConfig {
  type: 'oauth2-client';
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scope?: string;
  audience?: string;
}

/**
 * OAuth2 authorization code flow authentication (for future implementation)
 */
export interface OAuth2AuthCodeConfig {
  type: 'oauth2-code';
  clientId: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scope?: string;
  audience?: string;
}

/**
 * Discriminated union of all authentication configuration types
 */
export type AuthConfig =
  | NoAuthConfig
  | BearerAuthConfig
  | OAuth2ClientCredentialsConfig
  | OAuth2AuthCodeConfig;
