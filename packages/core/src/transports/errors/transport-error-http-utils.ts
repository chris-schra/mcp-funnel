import { TransportError, TransportErrorCode } from './transport-error.js';

/**
 * HTTP-specific error creation utilities for TransportError.
 *
 * Handles mapping of HTTP status codes to appropriate transport error codes and retryability.
 * @internal
 */

/**
 * Determines if an HTTP status code indicates a retryable error.
 *
 * Returns true for 5xx server errors and specific 4xx codes (408, 429).
 * @param statusCode - HTTP status code to check
 * @returns True if the status code indicates a retryable error
 * @internal
 */
export function isHttpStatusRetryable(statusCode: number): boolean {
  // 5xx server errors are generally retryable
  if (statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // Specific 4xx errors that are retryable
  switch (statusCode) {
    case 408: // Request Timeout
    case 429: // Too Many Requests
      return true;
    default:
      return false;
  }
}

/**
 * Creates a TransportError from an HTTP status code with appropriate error code and retryability.
 *
 * Maps HTTP status codes to TransportErrorCode values and determines retry behavior:
 * - 401/403: AUTHENTICATION_FAILED (non-retryable)
 * - 429: RATE_LIMITED (retryable)
 * - 502: BAD_GATEWAY (retryable)
 * - 503: SERVICE_UNAVAILABLE (retryable)
 * - 504: GATEWAY_TIMEOUT (retryable)
 * - 408: REQUEST_TIMEOUT (retryable)
 * - 5xx: SERVER_ERROR (retryable)
 * - Others: UNKNOWN_ERROR with status-based retryability
 * @param statusCode - HTTP status code
 * @param statusText - Optional HTTP status text
 * @param cause - Optional underlying error
 * @returns TransportError with appropriate code and retryability
 * @public
 */
export function createErrorFromHttpStatus(
  statusCode: number,
  statusText?: string,
  cause?: Error,
): TransportError {
  const message = statusText
    ? `HTTP ${statusCode}: ${statusText}`
    : `HTTP ${statusCode}`;

  // Determine if the error is retryable based on status code
  const isRetryable = isHttpStatusRetryable(statusCode);

  // Map status codes to appropriate transport error codes
  let code: TransportErrorCode;
  switch (statusCode) {
    case 401:
    case 403:
      // Authentication/authorization errors
      code = TransportErrorCode.AUTHENTICATION_FAILED;
      break;
    case 429:
      code = TransportErrorCode.RATE_LIMITED;
      break;
    case 502:
      code = TransportErrorCode.BAD_GATEWAY;
      break;
    case 503:
      code = TransportErrorCode.SERVICE_UNAVAILABLE;
      break;
    case 504:
      code = TransportErrorCode.GATEWAY_TIMEOUT;
      break;
    case 408:
      code = TransportErrorCode.REQUEST_TIMEOUT;
      break;
    default:
      if (statusCode >= 500) {
        code = TransportErrorCode.SERVER_ERROR;
      } else {
        code = TransportErrorCode.UNKNOWN_ERROR;
      }
  }

  return new TransportError(message, code, isRetryable, cause);
}
