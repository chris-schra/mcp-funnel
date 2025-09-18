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
}
