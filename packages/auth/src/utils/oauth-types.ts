/**
 * OAuth2 token response interface following RFC 6749
 */
export interface OAuth2TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  audience?: string;
}

/**
 * OAuth2 error response interface following RFC 6749
 */
export interface OAuth2ErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Shared OAuth2 constants
 */
export const AUTH_DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour
export const AUTH_MAX_RETRIES = 3;
export const AUTH_RETRY_DELAY_MS = 1000;
