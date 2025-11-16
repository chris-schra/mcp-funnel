/**
 * OAuth response creation utilities for building standardized HTTP responses.
 *
 * Provides static methods to create properly formatted OAuth 2.0 responses
 * with required HTTP headers according to RFC 6749 specifications.
 * @example
 * ```typescript
 * // Create error response
 * const errorResponse = OAuthResponseUtils.createOAuthErrorResponse({
 *   error: 'invalid_request',
 *   error_description: 'Missing client_id parameter'
 * });
 *
 * // Create token response
 * const tokenResponse = OAuthResponseUtils.createTokenResponse({
 *   access_token: 'abc123',
 *   token_type: 'Bearer',
 *   expires_in: 3600
 * });
 * ```
 * @public
 * @see file:../../provider/oauth-provider.ts - OAuth provider implementation
 */
import type { OAuthError } from '@mcp-funnel/models';

export class OAuthResponseUtils {
  /**
   * Creates an OAuth error response with proper security headers.
   *
   * Builds a structured error response compliant with RFC 6749 section 5.2,
   * including Cache-Control and Pragma headers to prevent response caching.
   * @param error - OAuth error object containing error code and optional description
   * @param statusCode - HTTP status code for the response (defaults to 400)
   * @returns Response object with status, headers, and error body
   * @example
   * ```typescript
   * const response = OAuthResponseUtils.createOAuthErrorResponse({
   *   error: 'invalid_client',
   *   error_description: 'Client authentication failed'
   * }, 401);
   * // Returns: { status: 401, headers: {...}, body: {...} }
   * ```
   * @public
   * @see file:../error/oauth-error.utils.ts - Error creation utilities
   */
  public static createOAuthErrorResponse(error: OAuthError, statusCode: number = 400) {
    return {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
      body: error,
    };
  }

  /**
   * Creates a successful token response with proper security headers.
   *
   * Builds a structured token response compliant with RFC 6749 section 5.1,
   * including Cache-Control and Pragma headers to prevent token caching.
   * @param tokenData - Token data object (typically contains access_token, token_type, expires_in)
   * @returns Response object with status 200, headers, and token data body
   * @example
   * ```typescript
   * const response = OAuthResponseUtils.createTokenResponse({
   *   access_token: 'eyJhbGc...',
   *   token_type: 'Bearer',
   *   expires_in: 3600,
   *   refresh_token: 'tGzv3JO...'
   * });
   * // Returns: { status: 200, headers: {...}, body: {...} }
   * ```
   * @public
   * @see file:../token/token.utils.ts - Token generation utilities
   */
  public static createTokenResponse(tokenData: Record<string, unknown>) {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
      body: tokenData,
    };
  }
}
