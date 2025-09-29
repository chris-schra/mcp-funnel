import { TransportError, TransportErrorCode } from './transport-error.js';

/**
 * Factory functions for creating TransportError instances.
 * Extracted from TransportError class to reduce file size and improve maintainability.
 */

/**
 * Creates a TransportError for connection failures (retryable)
 */
export function createConnectionFailedError(
  message: string,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Connection failed: ${message}`,
    TransportErrorCode.CONNECTION_FAILED,
    true,
    cause,
  );
}

/**
 * Creates a TransportError for connection timeouts (retryable)
 */
export function createConnectionTimeoutError(
  timeout: number,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Connection timeout after ${timeout}ms`,
    TransportErrorCode.CONNECTION_TIMEOUT,
    true,
    cause,
  );
}

/**
 * Creates a TransportError for connection refused (retryable)
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
 * Creates a TransportError for connection reset (retryable)
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
 * Creates a TransportError for DNS lookup failures (retryable)
 */
export function createDnsLookupFailedError(
  hostname: string,
  cause?: Error,
): TransportError {
  return new TransportError(
    `DNS lookup failed for ${hostname}`,
    TransportErrorCode.DNS_LOOKUP_FAILED,
    true,
    cause,
  );
}

/**
 * Creates a TransportError for SSL handshake failures (usually not retryable)
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
 * Creates a TransportError for protocol errors (not retryable)
 */
export function createProtocolError(
  message: string,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Protocol error: ${message}`,
    TransportErrorCode.PROTOCOL_ERROR,
    false,
    cause,
  );
}

/**
 * Creates a TransportError for invalid responses (not retryable)
 */
export function createInvalidResponseError(
  message: string,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Invalid response: ${message}`,
    TransportErrorCode.INVALID_RESPONSE,
    false,
    cause,
  );
}

/**
 * Creates a TransportError for request timeouts (retryable)
 */
export function createRequestTimeoutError(
  timeout: number,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Request timeout after ${timeout}ms`,
    TransportErrorCode.REQUEST_TIMEOUT,
    true,
    cause,
  );
}

/**
 * Creates a TransportError for rate limiting (retryable with backoff)
 */
export function createRateLimitedError(
  retryAfter?: number,
  cause?: Error,
): TransportError {
  const message = retryAfter
    ? `Rate limited, retry after ${retryAfter}s`
    : 'Rate limited';
  return new TransportError(
    message,
    TransportErrorCode.RATE_LIMITED,
    true,
    cause,
  );
}

/**
 * Creates a TransportError for service unavailable (retryable)
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
 * Creates a TransportError for bad gateway (retryable)
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
 * Creates a TransportError for gateway timeout (retryable)
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
 * Creates a TransportError for network unreachable (retryable)
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
 * Creates a TransportError for host unreachable (retryable)
 */
export function createHostUnreachableError(
  host: string,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Host ${host} is unreachable`,
    TransportErrorCode.HOST_UNREACHABLE,
    true,
    cause,
  );
}

/**
 * Creates a TransportError for too many redirects (not retryable)
 */
export function createTooManyRedirectsError(
  maxRedirects: number,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Too many redirects (max: ${maxRedirects})`,
    TransportErrorCode.TOO_MANY_REDIRECTS,
    false,
    cause,
  );
}

/**
 * Creates a TransportError for invalid URL (not retryable)
 */
export function createInvalidUrlError(
  url: string,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Invalid URL: ${url}`,
    TransportErrorCode.INVALID_URL,
    false,
    cause,
  );
}

/**
 * Creates a TransportError for authentication failures (not retryable)
 */
export function createAuthenticationFailedError(
  message: string,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Authentication failed: ${message}`,
    TransportErrorCode.AUTHENTICATION_FAILED,
    false,
    cause,
  );
}

/**
 * Creates a TransportError for server errors (retryable)
 */
export function createServerError(
  message: string,
  cause?: Error,
): TransportError {
  return new TransportError(
    `Server error: ${message}`,
    TransportErrorCode.SERVER_ERROR,
    true,
    cause,
  );
}

/**
 * Determines if an HTTP status code indicates a retryable error
 */
function isHttpStatusRetryable(statusCode: number): boolean {
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
 * Creates a TransportError from an HTTP status code
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
