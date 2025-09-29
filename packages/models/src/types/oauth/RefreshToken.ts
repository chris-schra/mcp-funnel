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
