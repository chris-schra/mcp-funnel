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
