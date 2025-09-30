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
