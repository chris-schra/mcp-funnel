import type { OAuth2ErrorResponse } from '../oauth-types.js';

/**
 * Parses error response from OAuth2 server into standardized error format.
 *
 * Attempts to extract OAuth2 error details from the response body JSON.
 * If JSON parsing fails (e.g., non-JSON response body), constructs a fallback
 * error with appropriate error code based on HTTP status:
 * - 5xx status codes map to 'server_error'
 * - All other status codes map to 'invalid_request'
 * @param response - Failed HTTP response from OAuth2 server (should be !response.ok)
 * @returns Promise resolving to OAuth2ErrorResponse, never throws
 * @example
 * ```typescript
 * if (!response.ok) {
 *   const errorResponse = await parseErrorResponse(response);
 *   // errorResponse.error: 'invalid_request' | 'server_error' | other OAuth2 error codes
 *   // errorResponse.error_description: Human-readable error message
 * }
 * ```
 * @see file:./create-oauth2-error.ts - Converts this response to AuthenticationError
 * @see file:../oauth-types.ts:16 - OAuth2ErrorResponse interface definition
 * @public
 */
export async function parseErrorResponse(
  response: Response,
): Promise<OAuth2ErrorResponse> {
  try {
    const errorData = await response.json();
    return errorData as OAuth2ErrorResponse;
  } catch {
    // If JSON parsing fails, return generic error based on status
    return {
      error: response.status >= 500 ? 'server_error' : 'invalid_request',
      error_description: `HTTP ${response.status}: ${response.statusText}`,
    };
  }
}
