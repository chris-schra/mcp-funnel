/**
 * Transport-specific error codes for different types of transport failures
 */
export enum TransportErrorCode {
  CONNECTION_FAILED = 'connection_failed',
  CONNECTION_TIMEOUT = 'connection_timeout',
  CONNECTION_REFUSED = 'connection_refused',
  CONNECTION_RESET = 'connection_reset',
  DNS_LOOKUP_FAILED = 'dns_lookup_failed',
  SSL_HANDSHAKE_FAILED = 'ssl_handshake_failed',
  PROTOCOL_ERROR = 'protocol_error',
  INVALID_RESPONSE = 'invalid_response',
  REQUEST_TIMEOUT = 'request_timeout',
  RATE_LIMITED = 'rate_limited',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  BAD_GATEWAY = 'bad_gateway',
  GATEWAY_TIMEOUT = 'gateway_timeout',
  NETWORK_UNREACHABLE = 'network_unreachable',
  HOST_UNREACHABLE = 'host_unreachable',
  TOO_MANY_REDIRECTS = 'too_many_redirects',
  INVALID_URL = 'invalid_url',
  AUTHENTICATION_FAILED = 'authentication_failed',
  SERVER_ERROR = 'server_error',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Transport error class that extends base Error with transport-specific error codes.
 * Includes retry indication for retryable vs non-retryable errors.
 */
export class TransportError extends Error {
  public readonly code: TransportErrorCode;
  public readonly isRetryable: boolean;
  public readonly cause?: Error;

  constructor(
    message: string,
    code: TransportErrorCode = TransportErrorCode.UNKNOWN_ERROR,
    isRetryable: boolean = false,
    cause?: Error,
  ) {
    super(message);
    this.name = 'TransportError';
    this.code = code;
    this.isRetryable = isRetryable;
    this.cause = cause;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, TransportError.prototype);
  }

  /**
   * Creates a TransportError for connection failures (retryable)
   */
  static connectionFailed(message: string, cause?: Error): TransportError {
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
  static connectionTimeout(timeout: number, cause?: Error): TransportError {
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
  static connectionRefused(
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
  static connectionReset(cause?: Error): TransportError {
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
  static dnsLookupFailed(hostname: string, cause?: Error): TransportError {
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
  static sslHandshakeFailed(cause?: Error): TransportError {
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
  static protocolError(message: string, cause?: Error): TransportError {
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
  static invalidResponse(message: string, cause?: Error): TransportError {
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
  static requestTimeout(timeout: number, cause?: Error): TransportError {
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
  static rateLimited(retryAfter?: number, cause?: Error): TransportError {
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
  static serviceUnavailable(cause?: Error): TransportError {
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
  static badGateway(cause?: Error): TransportError {
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
  static gatewayTimeout(cause?: Error): TransportError {
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
  static networkUnreachable(cause?: Error): TransportError {
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
  static hostUnreachable(host: string, cause?: Error): TransportError {
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
  static tooManyRedirects(maxRedirects: number, cause?: Error): TransportError {
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
  static invalidUrl(url: string, cause?: Error): TransportError {
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
  static authenticationFailed(message: string, cause?: Error): TransportError {
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
  static serverError(message: string, cause?: Error): TransportError {
    return new TransportError(
      `Server error: ${message}`,
      TransportErrorCode.SERVER_ERROR,
      true,
      cause,
    );
  }

  /**
   * Creates a TransportError from an HTTP status code
   */
  static fromHttpStatus(
    statusCode: number,
    statusText?: string,
    cause?: Error,
  ): TransportError {
    const message = statusText
      ? `HTTP ${statusCode}: ${statusText}`
      : `HTTP ${statusCode}`;

    // Determine if the error is retryable based on status code
    const isRetryable = TransportError.isHttpStatusRetryable(statusCode);

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

  /**
   * Determines if an HTTP status code indicates a retryable error
   */
  private static isHttpStatusRetryable(statusCode: number): boolean {
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
   * Convert the error to a JSON representation (useful for logging/debugging)
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      isRetryable: this.isRetryable,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}
