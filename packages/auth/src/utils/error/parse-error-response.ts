import type { OAuth2ErrorResponse } from '../oauth-types.js';

/**
 * Parses error response from OAuth2 server
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
