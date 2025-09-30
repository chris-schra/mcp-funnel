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

  public constructor(
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
   * Convert the error to a JSON representation (useful for logging/debugging)
   * @returns JSON object containing error details
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      isRetryable: this.isRetryable,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }

  // Static factory methods for backward compatibility
  public static connectionFailed(m: string, c?: Error): TransportError {
    return new TransportError(
      `Connection failed: ${m}`,
      TransportErrorCode.CONNECTION_FAILED,
      true,
      c,
    );
  }

  public static connectionTimeout(t: number, c?: Error): TransportError {
    return new TransportError(
      `Connection timeout after ${t}ms`,
      TransportErrorCode.CONNECTION_TIMEOUT,
      true,
      c,
    );
  }

  public static connectionRefused(
    h: string,
    p?: number,
    c?: Error,
  ): TransportError {
    const loc = p ? `${h}:${p}` : h;
    return new TransportError(
      `Connection refused to ${loc}`,
      TransportErrorCode.CONNECTION_REFUSED,
      true,
      c,
    );
  }

  public static connectionReset(c?: Error): TransportError {
    return new TransportError(
      'Connection was reset by peer',
      TransportErrorCode.CONNECTION_RESET,
      true,
      c,
    );
  }

  public static dnsLookupFailed(h: string, c?: Error): TransportError {
    return new TransportError(
      `DNS lookup failed for ${h}`,
      TransportErrorCode.DNS_LOOKUP_FAILED,
      true,
      c,
    );
  }

  public static sslHandshakeFailed(c?: Error): TransportError {
    return new TransportError(
      'SSL/TLS handshake failed',
      TransportErrorCode.SSL_HANDSHAKE_FAILED,
      false,
      c,
    );
  }

  public static protocolError(m: string, c?: Error): TransportError {
    return new TransportError(
      `Protocol error: ${m}`,
      TransportErrorCode.PROTOCOL_ERROR,
      false,
      c,
    );
  }

  public static invalidResponse(m: string, c?: Error): TransportError {
    return new TransportError(
      `Invalid response: ${m}`,
      TransportErrorCode.INVALID_RESPONSE,
      false,
      c,
    );
  }

  public static requestTimeout(t: number, c?: Error): TransportError {
    return new TransportError(
      `Request timeout after ${t}ms`,
      TransportErrorCode.REQUEST_TIMEOUT,
      true,
      c,
    );
  }

  public static rateLimited(r?: number, c?: Error): TransportError {
    const m = r ? `Rate limited, retry after ${r}s` : 'Rate limited';
    return new TransportError(m, TransportErrorCode.RATE_LIMITED, true, c);
  }

  public static serviceUnavailable(c?: Error): TransportError {
    return new TransportError(
      'Service temporarily unavailable',
      TransportErrorCode.SERVICE_UNAVAILABLE,
      true,
      c,
    );
  }

  public static badGateway(c?: Error): TransportError {
    return new TransportError(
      'Bad gateway response from upstream server',
      TransportErrorCode.BAD_GATEWAY,
      true,
      c,
    );
  }

  public static gatewayTimeout(c?: Error): TransportError {
    return new TransportError(
      'Gateway timeout from upstream server',
      TransportErrorCode.GATEWAY_TIMEOUT,
      true,
      c,
    );
  }

  public static networkUnreachable(c?: Error): TransportError {
    return new TransportError(
      'Network is unreachable',
      TransportErrorCode.NETWORK_UNREACHABLE,
      true,
      c,
    );
  }

  public static hostUnreachable(h: string, c?: Error): TransportError {
    return new TransportError(
      `Host ${h} is unreachable`,
      TransportErrorCode.HOST_UNREACHABLE,
      true,
      c,
    );
  }

  public static tooManyRedirects(m: number, c?: Error): TransportError {
    return new TransportError(
      `Too many redirects (max: ${m})`,
      TransportErrorCode.TOO_MANY_REDIRECTS,
      false,
      c,
    );
  }

  public static invalidUrl(u: string, c?: Error): TransportError {
    return new TransportError(
      `Invalid URL: ${u}`,
      TransportErrorCode.INVALID_URL,
      false,
      c,
    );
  }

  public static authenticationFailed(m: string, c?: Error): TransportError {
    return new TransportError(
      `Authentication failed: ${m}`,
      TransportErrorCode.AUTHENTICATION_FAILED,
      false,
      c,
    );
  }

  public static serverError(m: string, c?: Error): TransportError {
    return new TransportError(
      `Server error: ${m}`,
      TransportErrorCode.SERVER_ERROR,
      true,
      c,
    );
  }

  public static fromHttpStatus(
    s: number,
    t?: string,
    c?: Error,
  ): TransportError {
    const msg = t ? `HTTP ${s}: ${t}` : `HTTP ${s}`;
    const retry = (s >= 500 && s < 600) || s === 408 || s === 429;

    let code: TransportErrorCode;
    if (s === 401 || s === 403) code = TransportErrorCode.AUTHENTICATION_FAILED;
    else if (s === 429) code = TransportErrorCode.RATE_LIMITED;
    else if (s === 502) code = TransportErrorCode.BAD_GATEWAY;
    else if (s === 503) code = TransportErrorCode.SERVICE_UNAVAILABLE;
    else if (s === 504) code = TransportErrorCode.GATEWAY_TIMEOUT;
    else if (s === 408) code = TransportErrorCode.REQUEST_TIMEOUT;
    else
      code =
        s >= 500
          ? TransportErrorCode.SERVER_ERROR
          : TransportErrorCode.UNKNOWN_ERROR;

    return new TransportError(msg, code, retry, c);
  }
}
