/**
 * OAuth2 core types and constants following RFC 6749 specifications.
 *
 * @public
 */

/**
 * OAuth2 token response interface following RFC 6749 section 5.1.
 *
 * Represents a successful token endpoint response containing access token
 * and optional metadata.
 * @public
 * @see {@link OAuth2ErrorResponse} - Error response format
 */
export interface OAuth2TokenResponse {
  /** The access token issued by the authorization server */
  access_token: string;
  /** Type of token issued (typically 'Bearer') */
  token_type?: string;
  /** Lifetime in seconds of the access token */
  expires_in?: number;
  /** Refresh token for obtaining new access tokens */
  refresh_token?: string;
  /** Space-delimited list of granted scopes */
  scope?: string;
  /** Intended audience for the token */
  audience?: string;
}

/**
 * OAuth2 error response interface following RFC 6749 section 5.2.
 *
 * Represents an error response from the authorization or token endpoint.
 * @public
 * @see {@link OAuth2TokenResponse} - Success response format
 */
export interface OAuth2ErrorResponse {
  /** Error code from RFC 6749 (e.g., 'invalid_request', 'invalid_client') */
  error: string;
  /** Human-readable error description */
  error_description?: string;
  /** URI to documentation about the error */
  error_uri?: string;
}

/**
 * Default expiry time for access tokens in seconds.
 * @public
 */
export const AUTH_DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Maximum number of retry attempts for failed OAuth requests.
 * @public
 */
export const AUTH_MAX_RETRIES = 3;

/**
 * Delay in milliseconds between retry attempts.
 * @public
 */
export const AUTH_RETRY_DELAY_MS = 1000;
