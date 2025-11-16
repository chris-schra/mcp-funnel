/**
 * Scope information for display in consent UI
 */
export interface ScopeInfo {
  /** Scope identifier */
  scope: string;
  /** Human-readable scope name */
  name: string;
  /** Description of what this scope grants access to */
  description: string;
}

/**
 * Data required to render the OAuth consent page
 */
export interface ConsentPageData {
  /** OAuth client ID */
  clientId: string;
  /** Client application name */
  clientName: string;
  /** Client initial for icon display */
  clientInitial: string;
  /** User's email address */
  userEmail: string;
  /** Requested scopes with descriptions */
  scopes: ScopeInfo[];
  /** Redirect URI from authorization request */
  redirectUri: string;
  /** State parameter for CSRF protection */
  state?: string;
  /** Raw scope string */
  scopeString: string;
  /** PKCE code challenge */
  codeChallenge?: string;
  /** PKCE code challenge method */
  codeChallengeMethod?: string;
  /** Form action URL for consent submission */
  actionUrl: string;
}

/**
 * Result of consent page data validation
 */
export interface ConsentPageValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Array of validation error messages */
  errors: string[];
}
