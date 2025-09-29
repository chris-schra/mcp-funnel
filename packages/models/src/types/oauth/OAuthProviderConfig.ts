/**
 * OAuth Provider configuration
 */
export interface OAuthProviderConfig {
  /** Authorization server issuer identifier */
  issuer: string;
  /** Base URL for OAuth endpoints */
  baseUrl: string;
  /** Default token expiration (seconds) */
  defaultTokenExpiry: number;
  /** Default authorization code expiration (seconds) */
  defaultCodeExpiry: number;
  /** Default expiry for client secrets in seconds (default: 1 year = 31536000) */
  defaultClientSecretExpiry?: number;
  /** Default expiry for refresh tokens in seconds (default: 30 days = 2592000) */
  defaultRefreshTokenExpiry?: number;
  /** Whether to rotate refresh tokens on use (default: false) */
  requireTokenRotation?: boolean;
  /** Supported scopes */
  supportedScopes: string[];
  /** Whether to require PKCE for public clients */
  requirePkce: boolean;
  /** Whether to issue refresh tokens */
  issueRefreshTokens: boolean;
}
