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
