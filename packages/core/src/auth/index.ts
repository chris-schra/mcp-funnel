/**
 * Interface for authentication providers
 * Responsible for providing authentication headers for HTTP requests
 */
export interface IAuthProvider {
  /**
   * Returns authentication headers for requests
   * @returns Promise resolving to header name-value pairs
   */
  getHeaders(): Promise<Record<string, string>>;

  /**
   * Checks if the current authentication state is valid
   * @returns Promise resolving to true if auth is valid, false otherwise
   */
  isValid(): Promise<boolean>;

  /**
   * Optional method for refreshing credentials
   * Should be implemented by providers that support credential refresh
   */
  refresh?(): Promise<void>;

  /**
   * Optional method for completing OAuth authorization code flow
   * Should be implemented by OAuth2 authorization code providers
   */
  completeOAuthFlow?(state: string, code: string): Promise<void>;
}

/**
 * Token data structure containing access token and metadata
 */
export interface TokenData {
  /** The access token string */
  accessToken: string;

  /** When the token expires */
  expiresAt: Date;

  /** Token type (default: "Bearer") */
  tokenType: string;

  /** Optional scope associated with the token */
  scope?: string;
}

/**
 * Interface for token storage operations
 * Handles storing, retrieving, and managing OAuth tokens with lifecycle management
 */
export interface ITokenStorage {
  /**
   * Store token with metadata
   * @param token - Token data to store
   */
  store(token: TokenData): Promise<void>;

  /**
   * Retrieve current stored token
   * @returns Token data if available, null if no token stored
   */
  retrieve(): Promise<TokenData | null>;

  /**
   * Remove stored token
   */
  clear(): Promise<void>;

  /**
   * Check if the current stored token is expired
   * @returns true if token is expired or no token exists, false if valid
   */
  isExpired(): Promise<boolean>;

  /**
   * Optional method to schedule token refresh
   * @param callback - Function to call when refresh is needed
   */
  scheduleRefresh?(callback: () => Promise<void>): void;
}
