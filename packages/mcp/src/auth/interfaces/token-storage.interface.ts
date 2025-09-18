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
