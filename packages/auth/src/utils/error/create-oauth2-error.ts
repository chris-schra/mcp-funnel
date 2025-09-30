import {
  AuthenticationError,
  OAuth2ErrorCode,
  AuthErrorCode,
} from '../../errors/authentication-error.js';
import type { OAuth2ErrorResponse } from '../oauth-types.js';

/**
 * Creates appropriate AuthenticationError from OAuth2 error response.
 *
 * Maps OAuth2 error codes (as defined in RFC 6749) to internal error codes
 * and constructs a user-friendly error message. Handles both standard OAuth2
 * error codes and unknown errors by falling back to generic error types based
 * on HTTP status code.
 * @param errorResponse - OAuth2 error response containing error code and optional description
 * @param statusCode - HTTP status code from the failed request (used for fallback classification)
 * @returns AuthenticationError with mapped error code and descriptive message
 * @example
 * ```typescript
 * const errorResponse = {
 *   error: 'invalid_client',
 *   error_description: 'Client authentication failed'
 * };
 * const error = createOAuth2Error(errorResponse, 401);
 * // Returns AuthenticationError with code OAuth2ErrorCode.INVALID_CLIENT
 * ```
 * @see file:../../errors/authentication-error.ts - AuthenticationError class
 * @see file:./parse-error-response.ts - Parses OAuth2 error responses from fetch Response
 * @public
 */
export function createOAuth2Error(
  errorResponse: OAuth2ErrorResponse,
  statusCode: number,
): AuthenticationError {
  const message = errorResponse.error_description
    ? `OAuth2 authentication failed: ${errorResponse.error} - ${errorResponse.error_description}`
    : `OAuth2 authentication failed: ${errorResponse.error}`;

  // Map OAuth2 error codes to our error codes
  let errorCode: OAuth2ErrorCode | AuthErrorCode;

  switch (errorResponse.error) {
    case 'invalid_request':
      errorCode = OAuth2ErrorCode.INVALID_REQUEST;
      break;
    case 'invalid_client':
      errorCode = OAuth2ErrorCode.INVALID_CLIENT;
      break;
    case 'invalid_grant':
      errorCode = OAuth2ErrorCode.INVALID_GRANT;
      break;
    case 'unauthorized_client':
      errorCode = OAuth2ErrorCode.UNAUTHORIZED_CLIENT;
      break;
    case 'unsupported_grant_type':
      errorCode = OAuth2ErrorCode.UNSUPPORTED_GRANT_TYPE;
      break;
    case 'invalid_scope':
      errorCode = OAuth2ErrorCode.INVALID_SCOPE;
      break;
    case 'access_denied':
      errorCode = OAuth2ErrorCode.ACCESS_DENIED;
      break;
    case 'unsupported_response_type':
      errorCode = OAuth2ErrorCode.UNSUPPORTED_RESPONSE_TYPE;
      break;
    case 'server_error':
      errorCode = OAuth2ErrorCode.SERVER_ERROR;
      break;
    case 'temporarily_unavailable':
      errorCode = OAuth2ErrorCode.TEMPORARILY_UNAVAILABLE;
      break;
    default:
      errorCode =
        statusCode >= 500
          ? OAuth2ErrorCode.SERVER_ERROR
          : AuthErrorCode.UNKNOWN_ERROR;
  }

  return new AuthenticationError(message, errorCode);
}
