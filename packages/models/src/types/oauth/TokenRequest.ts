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
