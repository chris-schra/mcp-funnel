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
