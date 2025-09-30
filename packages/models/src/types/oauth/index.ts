/**
 * OAuth 2.0 Provider types and interfaces for mcp-funnel
 * Implements OAuth 2.0 Authorization Server functionality
 */
export * from './AccessToken.js';
export * from './AuthorizationCode.js';
export * from './AuthorizationRequest.js';
export * from './ClientRegistration.js';
export * from './IOAuthProviderStorage.js';
export * from './IUserConsentService.js';
export * from './OAuthError.js';
export * from './OAuthProviderConfig.js';
export * from './RecordUserConsentOptions.js';
export * from './RefreshToken.js';
export * from './TokenRequest.js';
export * from './TokenResponse.js';
export * from './UserConsentScope.js';

/**
 * OAuth2 client credentials flow authentication
 *
 * Input accepts both legacy and new field names, but normalized output uses:
 * - tokenEndpoint (preferred over legacy tokenUrl)
 * - scope as space-delimited string (converted from scopes array if provided)
 */
export interface OAuth2ClientCredentialsConfig {
  type: 'oauth2-client';
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  scope?: string;
  audience?: string;
}

/**
 * OAuth2 authorization code flow authentication
 *
 * Input accepts both legacy and new field names, but normalized output uses:
 * - authorizationEndpoint (preferred over legacy authUrl)
 * - tokenEndpoint (preferred over legacy tokenUrl)
 * - scope as space-delimited string (converted from scopes array if provided)
 */
export interface OAuth2AuthCodeConfig {
  type: 'oauth2-code';
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scope?: string;
  audience?: string;
}

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
 * Discriminated union of all authentication configuration types
 */
export type AuthConfig =
  | NoAuthConfig
  | BearerAuthConfig
  | OAuth2ClientCredentialsConfig
  | OAuth2AuthCodeConfig;
