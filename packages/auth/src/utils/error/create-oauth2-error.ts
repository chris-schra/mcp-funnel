import {
  AuthenticationError,
  OAuth2ErrorCode,
  AuthErrorCode,
} from '../../errors/authentication-error.js';
import type { OAuth2ErrorResponse } from '../oauth-types.js';

/**
 * Creates appropriate AuthenticationError from OAuth2 error response
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
