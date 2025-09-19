/**
 * OAuth 2.0 Provider types and interfaces for mcp-funnel
 * Implements OAuth 2.0 Authorization Server functionality
 */

/**
 * OAuth Client registration data
 */
export interface ClientRegistration {
  /** Unique client identifier */
  client_id: string;
  /** Client secret (optional for public clients) */
  client_secret?: string;
  /** Client name for display purposes */
  client_name?: string;
  /** Valid redirect URIs for this client */
  redirect_uris: string[];
  /** Grant types this client is allowed to use */
  grant_types?: string[];
  /** Response types this client can request */
  response_types?: string[];
  /** Scopes this client is allowed to request */
  scope?: string;
  /** When the client was registered */
  client_id_issued_at?: number;
  /** When the client secret expires (0 means never) */
  client_secret_expires_at?: number;
}

/**
 * Authorization code with associated metadata
 */
export interface AuthorizationCode {
  /** The authorization code value */
  code: string;
  /** Client ID that requested this code */
  client_id: string;
  /** User who authorized the code */
  user_id: string;
  /** Redirect URI used in the authorization request */
  redirect_uri: string;
  /** Scopes granted */
  scopes: string[];
  /** PKCE code challenge (if used) */
  code_challenge?: string;
  /** PKCE code challenge method */
  code_challenge_method?: string;
  /** State parameter from authorization request */
  state?: string;
  /** When the code expires */
  expires_at: number;
  /** When the code was created */
  created_at: number;
}

/**
 * Access token with metadata
 */
export interface AccessToken {
  /** The access token value */
  token: string;
  /** Client ID that owns this token */
  client_id: string;
  /** User ID this token represents */
  user_id: string;
  /** Scopes granted to this token */
  scopes: string[];
  /** When the token expires */
  expires_at: number;
  /** When the token was created */
  created_at: number;
  /** Token type (always 'Bearer' for now) */
  token_type: 'Bearer';
}

/**
 * Refresh token with metadata
 */
export interface RefreshToken {
  /** The refresh token value */
  token: string;
  /** Client ID that owns this token */
  client_id: string;
  /** User ID this token represents */
  user_id: string;
  /** Scopes this refresh token can grant */
  scopes: string[];
  /** When the token expires (0 means never) */
  expires_at: number;
  /** When the token was created */
  created_at: number;
}

/**
 * Authorization request parameters
 */
export interface AuthorizationRequest {
  /** Response type (must be 'code' for authorization code flow) */
  response_type: string;
  /** Client identifier */
  client_id: string;
  /** Redirect URI */
  redirect_uri: string;
  /** Requested scopes */
  scope?: string;
  /** State parameter for CSRF protection */
  state?: string;
  /** PKCE code challenge */
  code_challenge?: string;
  /** PKCE code challenge method */
  code_challenge_method?: string;
}

/**
 * Token request parameters
 */
export interface TokenRequest {
  /** Grant type */
  grant_type: string;
  /** Authorization code (for authorization_code grant) */
  code?: string;
  /** Redirect URI (must match authorization request) */
  redirect_uri?: string;
  /** Client ID */
  client_id: string;
  /** Client secret (for confidential clients) */
  client_secret?: string;
  /** PKCE code verifier */
  code_verifier?: string;
  /** Refresh token (for refresh_token grant) */
  refresh_token?: string;
  /** Requested scope (for refresh_token grant) */
  scope?: string;
}

/**
 * Token response
 */
export interface TokenResponse {
  /** Access token */
  access_token: string;
  /** Token type (always 'Bearer') */
  token_type: 'Bearer';
  /** Token expiration in seconds */
  expires_in?: number;
  /** Refresh token (optional) */
  refresh_token?: string;
  /** Granted scopes */
  scope?: string;
}

/**
 * OAuth error response
 */
export interface OAuthError {
  /** Error code */
  error: string;
  /** Human-readable error description */
  error_description?: string;
  /** URI with error information */
  error_uri?: string;
}

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
  /** Supported scopes */
  supportedScopes: string[];
  /** Whether to require PKCE for public clients */
  requirePkce: boolean;
  /** Whether to issue refresh tokens */
  issueRefreshTokens: boolean;
}

/**
 * Storage interface for OAuth provider data
 */
export interface IOAuthProviderStorage {
  // Client management
  saveClient(client: ClientRegistration): Promise<void>;
  getClient(clientId: string): Promise<ClientRegistration | null>;
  deleteClient(clientId: string): Promise<void>;

  // Authorization code management
  saveAuthorizationCode(code: AuthorizationCode): Promise<void>;
  getAuthorizationCode(code: string): Promise<AuthorizationCode | null>;
  deleteAuthorizationCode(code: string): Promise<void>;

  // Access token management
  saveAccessToken(token: AccessToken): Promise<void>;
  getAccessToken(token: string): Promise<AccessToken | null>;
  deleteAccessToken(token: string): Promise<void>;

  // Refresh token management
  saveRefreshToken(token: RefreshToken): Promise<void>;
  getRefreshToken(token: string): Promise<RefreshToken | null>;
  deleteRefreshToken(token: string): Promise<void>;

  // Cleanup expired tokens
  cleanupExpiredTokens(): Promise<void>;
}

/**
 * User consent interface
 */
export interface IUserConsentService {
  /**
   * Check if user has already consented to the requested scopes
   */
  hasUserConsented(
    userId: string,
    clientId: string,
    scopes: string[],
  ): Promise<boolean>;

  /**
   * Record user consent for specific scopes
   */
  recordUserConsent(
    userId: string,
    clientId: string,
    scopes: string[],
  ): Promise<void>;

  /**
   * Revoke user consent for a client
   */
  revokeUserConsent(userId: string, clientId: string): Promise<void>;
}

/**
 * Standard OAuth 2.0 error codes
 */
export const OAuthErrorCodes = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  INVALID_SCOPE: 'invalid_scope',
  ACCESS_DENIED: 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  SERVER_ERROR: 'server_error',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
} as const;

/**
 * Standard OAuth 2.0 grant types
 */
export const GrantTypes = {
  AUTHORIZATION_CODE: 'authorization_code',
  REFRESH_TOKEN: 'refresh_token',
  CLIENT_CREDENTIALS: 'client_credentials',
} as const;

/**
 * Standard OAuth 2.0 response types
 */
export const ResponseTypes = {
  CODE: 'code',
} as const;

/**
 * PKCE code challenge methods
 */
export const CodeChallengeMethods = {
  PLAIN: 'plain',
  S256: 'S256',
} as const;
