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
