/**
 * OAuth error handling utilities
 */

import { parseErrorResponse } from './parse-error-response.js';
import { createOAuth2Error } from './create-oauth2-error.js';
import { isRetryableError } from './is-retryable-error.js';

/**
 * Utility class providing static methods for OAuth2 error handling.
 *
 * Consolidates error parsing, creation, and retry logic for OAuth2 authentication
 * flows. All methods are available as static members for convenient access.
 *
 * @example
 * ```typescript
 * import { OAuthErrorUtils } from './oauth-error.utils.js';
 *
 * // Parse error from HTTP response
 * const errorResponse = await OAuthErrorUtils.parseErrorResponse(response);
 *
 * // Create authentication error
 * const error = OAuthErrorUtils.createOAuth2Error(errorResponse, 401);
 *
 * // Check if error is retryable
 * if (OAuthErrorUtils.isRetryableError(error)) {
 *   // Retry logic
 * }
 * ```
 *
 * @public
 * @see {@link parseErrorResponse}
 * @see {@link createOAuth2Error}
 * @see {@link isRetryableError}
 */
export class OAuthErrorUtils {
  /**
   * Parse OAuth2 error response from HTTP Response object.
   * @public
   * @see {@link parseErrorResponse}
   */
  public static parseErrorResponse = parseErrorResponse;

  /**
   * Create AuthenticationError from OAuth2 error response.
   * @public
   * @see {@link createOAuth2Error}
   */
  public static createOAuth2Error = createOAuth2Error;

  /**
   * Check if error is retryable (network errors, not OAuth2 errors).
   * @public
   * @see {@link isRetryableError}
   */
  public static isRetryableError = isRetryableError;
}

// Re-export individual functions for direct import
export { parseErrorResponse } from './parse-error-response.js';
export { createOAuth2Error } from './create-oauth2-error.js';
export { isRetryableError } from './is-retryable-error.js';
