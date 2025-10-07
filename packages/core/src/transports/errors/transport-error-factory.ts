import { TransportError, TransportErrorCode } from './transport-error.js';

/**
 * Factory functions for creating TransportError instances with standardized error codes and retryability.
 *
 * Provides a type-safe API for creating transport errors with appropriate categorization and retry behavior.
 * Extracted from TransportError class to reduce file size and improve maintainability.
 * @public
 * @see file:./transport-error.ts - TransportError base class
 */

// Re-export HTTP-specific utilities
export { createErrorFromHttpStatus } from './transport-error-http-utils.js';

/**
 * Creates a retryable connection failure error.
 * @param message - Descriptive error message
 * @param cause - Optional underlying error that caused the failure
 * @returns TransportError with CONNECTION_FAILED code and retryable=true
 * @public
 */
export function createConnectionFailedError(message: string, cause?: Error): TransportError {
  return new TransportError(
    `Connection failed: ${message}`,
    TransportErrorCode.CONNECTION_FAILED,
    true,
    cause,
  );
}

/**
 * Creates a retryable connection timeout error.
 * @param timeout - Timeout value in milliseconds that was exceeded
 * @param cause - Optional underlying error
 * @returns TransportError with CONNECTION_TIMEOUT code and retryable=true
 * @public
 */
export function createConnectionTimeoutError(timeout: number, cause?: Error): TransportError {
  return new TransportError(
    `Connection timeout after ${timeout}ms`,
    TransportErrorCode.CONNECTION_TIMEOUT,
    true,
    cause,
  );
}

/**
 * Creates a retryable connection refused error.
 * @param host - Hostname that refused the connection
 * @param port - Optional port number
 * @param cause - Optional underlying error
 * @returns TransportError with CONNECTION_REFUSED code and retryable=true
 * @public
 */
export function createConnectionRefusedError(
  host: string,
  port?: number,
  cause?: Error,
): TransportError {
  const location = port ? `${host}:${port}` : host;
  return new TransportError(
    `Connection refused to ${location}`,
    TransportErrorCode.CONNECTION_REFUSED,
    true,
    cause,
  );
}

/**
 * Creates a retryable connection reset error.
 * @param cause - Optional underlying error
 * @returns TransportError with CONNECTION_RESET code and retryable=true
 * @public
 */
export function createConnectionResetError(cause?: Error): TransportError {
  return new TransportError(
    'Connection was reset by peer',
    TransportErrorCode.CONNECTION_RESET,
    true,
    cause,
  );
}

/**
 * Creates a retryable DNS lookup failure error.
 * @param hostname - Hostname that failed DNS resolution
 * @param cause - Optional underlying error
 * @returns TransportError with DNS_LOOKUP_FAILED code and retryable=true
 * @public
 */
export function createDnsLookupFailedError(hostname: string, cause?: Error): TransportError {
  return new TransportError(
    `DNS lookup failed for ${hostname}`,
    TransportErrorCode.DNS_LOOKUP_FAILED,
    true,
    cause,
  );
}

/**
 * Creates a non-retryable SSL/TLS handshake failure error.
 * @param cause - Optional underlying error
 * @returns TransportError with SSL_HANDSHAKE_FAILED code and retryable=false
 * @public
 */
export function createSslHandshakeFailedError(cause?: Error): TransportError {
  return new TransportError(
    'SSL/TLS handshake failed',
    TransportErrorCode.SSL_HANDSHAKE_FAILED,
    false,
    cause,
  );
}

/**
 * Creates a non-retryable protocol error.
 * @param message - Descriptive error message
 * @param cause - Optional underlying error
 * @returns TransportError with PROTOCOL_ERROR code and retryable=false
 * @public
 */
export function createProtocolError(message: string, cause?: Error): TransportError {
  return new TransportError(
    `Protocol error: ${message}`,
    TransportErrorCode.PROTOCOL_ERROR,
    false,
    cause,
  );
}

/**
 * Creates a non-retryable invalid response error.
 * @param message - Descriptive error message
 * @param cause - Optional underlying error
 * @returns TransportError with INVALID_RESPONSE code and retryable=false
 * @public
 */
export function createInvalidResponseError(message: string, cause?: Error): TransportError {
  return new TransportError(
    `Invalid response: ${message}`,
    TransportErrorCode.INVALID_RESPONSE,
    false,
    cause,
  );
}

/**
 * Creates a retryable request timeout error.
 * @param timeout - Timeout value in milliseconds that was exceeded
 * @param cause - Optional underlying error
 * @returns TransportError with REQUEST_TIMEOUT code and retryable=true
 * @public
 */
export function createRequestTimeoutError(timeout: number, cause?: Error): TransportError {
  return new TransportError(
    `Request timeout after ${timeout}ms`,
    TransportErrorCode.REQUEST_TIMEOUT,
    true,
    cause,
  );
}

/**
 * Creates a retryable rate limit error with optional retry-after hint.
 * @param retryAfter - Optional retry-after delay in seconds
 * @param cause - Optional underlying error
 * @returns TransportError with RATE_LIMITED code and retryable=true
 * @public
 */
export function createRateLimitedError(retryAfter?: number, cause?: Error): TransportError {
  const message = retryAfter ? `Rate limited, retry after ${retryAfter}s` : 'Rate limited';
  return new TransportError(message, TransportErrorCode.RATE_LIMITED, true, cause);
}

/**
 * Creates a retryable service unavailable error (HTTP 503).
 * @param cause - Optional underlying error
 * @returns TransportError with SERVICE_UNAVAILABLE code and retryable=true
 * @public
 */
export function createServiceUnavailableError(cause?: Error): TransportError {
  return new TransportError(
    'Service temporarily unavailable',
    TransportErrorCode.SERVICE_UNAVAILABLE,
    true,
    cause,
  );
}

/**
 * Creates a retryable bad gateway error (HTTP 502).
 * @param cause - Optional underlying error
 * @returns TransportError with BAD_GATEWAY code and retryable=true
 * @public
 */
export function createBadGatewayError(cause?: Error): TransportError {
  return new TransportError(
    'Bad gateway response from upstream server',
    TransportErrorCode.BAD_GATEWAY,
    true,
    cause,
  );
}

/**
 * Creates a retryable gateway timeout error (HTTP 504).
 * @param cause - Optional underlying error
 * @returns TransportError with GATEWAY_TIMEOUT code and retryable=true
 * @public
 */
export function createGatewayTimeoutError(cause?: Error): TransportError {
  return new TransportError(
    'Gateway timeout from upstream server',
    TransportErrorCode.GATEWAY_TIMEOUT,
    true,
    cause,
  );
}

/**
 * Creates a retryable network unreachable error.
 * @param cause - Optional underlying error
 * @returns TransportError with NETWORK_UNREACHABLE code and retryable=true
 * @public
 */
export function createNetworkUnreachableError(cause?: Error): TransportError {
  return new TransportError(
    'Network is unreachable',
    TransportErrorCode.NETWORK_UNREACHABLE,
    true,
    cause,
  );
}

/**
 * Creates a retryable host unreachable error.
 * @param host - Hostname that is unreachable
 * @param cause - Optional underlying error
 * @returns TransportError with HOST_UNREACHABLE code and retryable=true
 * @public
 */
export function createHostUnreachableError(host: string, cause?: Error): TransportError {
  return new TransportError(
    `Host ${host} is unreachable`,
    TransportErrorCode.HOST_UNREACHABLE,
    true,
    cause,
  );
}

/**
 * Creates a non-retryable too many redirects error.
 * @param maxRedirects - Maximum number of redirects that was exceeded
 * @param cause - Optional underlying error
 * @returns TransportError with TOO_MANY_REDIRECTS code and retryable=false
 * @public
 */
export function createTooManyRedirectsError(maxRedirects: number, cause?: Error): TransportError {
  return new TransportError(
    `Too many redirects (max: ${maxRedirects})`,
    TransportErrorCode.TOO_MANY_REDIRECTS,
    false,
    cause,
  );
}

/**
 * Creates a non-retryable invalid URL error.
 * @param url - Invalid URL string
 * @param cause - Optional underlying error
 * @returns TransportError with INVALID_URL code and retryable=false
 * @public
 */
export function createInvalidUrlError(url: string, cause?: Error): TransportError {
  return new TransportError(`Invalid URL: ${url}`, TransportErrorCode.INVALID_URL, false, cause);
}

/**
 * Creates a non-retryable authentication failure error.
 * @param message - Descriptive error message
 * @param cause - Optional underlying error
 * @returns TransportError with AUTHENTICATION_FAILED code and retryable=false
 * @public
 */
export function createAuthenticationFailedError(message: string, cause?: Error): TransportError {
  return new TransportError(
    `Authentication failed: ${message}`,
    TransportErrorCode.AUTHENTICATION_FAILED,
    false,
    cause,
  );
}

/**
 * Creates a retryable server error (HTTP 5xx).
 * @param message - Descriptive error message
 * @param cause - Optional underlying error
 * @returns TransportError with SERVER_ERROR code and retryable=true
 * @public
 */
export function createServerError(message: string, cause?: Error): TransportError {
  return new TransportError(
    `Server error: ${message}`,
    TransportErrorCode.SERVER_ERROR,
    true,
    cause,
  );
}
