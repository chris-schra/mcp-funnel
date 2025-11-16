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
  /** URI where user can provide consent (for consent_required errors) */
  consent_uri?: string;
}
