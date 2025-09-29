/**
 * Standard OAuth2 error codes as defined in RFC 6749
 */
export enum OAuth2ErrorCode {
  INVALID_REQUEST = 'invalid_request',
  INVALID_CLIENT = 'invalid_client',
  INVALID_GRANT = 'invalid_grant',
  UNAUTHORIZED_CLIENT = 'unauthorized_client',
  UNSUPPORTED_GRANT_TYPE = 'unsupported_grant_type',
  INVALID_SCOPE = 'invalid_scope',
  ACCESS_DENIED = 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE = 'unsupported_response_type',
  SERVER_ERROR = 'server_error',
  TEMPORARILY_UNAVAILABLE = 'temporarily_unavailable',
}

/**
 * Additional authentication error codes beyond OAuth2 spec
 */
export enum AuthErrorCode {
  TOKEN_EXPIRED = 'token_expired',
  TOKEN_REVOKED = 'token_revoked',
  INVALID_TOKEN = 'invalid_token',
  MISSING_TOKEN = 'missing_token',
  NETWORK_ERROR = 'network_error',
  UNKNOWN_ERROR = 'unknown_error',
}

export type ErrorCode = OAuth2ErrorCode | AuthErrorCode;

/**
 * Authentication error class that extends base Error with OAuth2 error code support.
 * Designed with security in mind - never exposes tokens or sensitive data in error messages.
 */
export class AuthenticationError extends Error {
  public readonly code: ErrorCode;
  public readonly cause?: Error;

  public constructor(
    message: string,
    code: ErrorCode = AuthErrorCode.UNKNOWN_ERROR,
    cause?: Error,
  ) {
    super(AuthenticationError.sanitizeMessage(message));
    this.name = 'AuthenticationError';
    this.code = code;
    this.cause = cause;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }

  /**
   * Sanitizes error messages to prevent sensitive data exposure
   */
  private static sanitizeMessage(message: string): string {
    // Remove potential tokens, secrets, or other sensitive data patterns
    return message
      .replace(/\b[a-zA-Z0-9+/]{20,}={0,2}\b/g, '[REDACTED_TOKEN]') // Base64-like tokens
      .replace(/\bBearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]') // Bearer tokens
      .replace(/\baccess_token[=:]\s*[^\s&]+/gi, 'access_token=[REDACTED]') // URL params
      .replace(/\brefresh_token[=:]\s*[^\s&]+/gi, 'refresh_token=[REDACTED]')
      .replace(/\bclient_secret[=:]\s*[^\s&]+/gi, 'client_secret=[REDACTED]')
      .replace(/\bpassword[=:]\s*[^\s&]+/gi, 'password=[REDACTED]');
  }

  /**
   * Creates an AuthenticationError for invalid or missing access token
   */
  public static invalidToken(cause?: Error): AuthenticationError {
    return new AuthenticationError(
      'Access token is invalid or has been revoked',
      AuthErrorCode.INVALID_TOKEN,
      cause,
    );
  }

  /**
   * Creates an AuthenticationError for expired access token
   */
  public static expiredToken(cause?: Error): AuthenticationError {
    return new AuthenticationError(
      'Access token has expired',
      AuthErrorCode.TOKEN_EXPIRED,
      cause,
    );
  }

  /**
   * Creates an AuthenticationError for missing access token
   */
  public static missingToken(): AuthenticationError {
    return new AuthenticationError(
      'No access token provided',
      AuthErrorCode.MISSING_TOKEN,
    );
  }

  /**
   * Creates an AuthenticationError for revoked token
   */
  public static revokedToken(cause?: Error): AuthenticationError {
    return new AuthenticationError(
      'Access token has been revoked',
      AuthErrorCode.TOKEN_REVOKED,
      cause,
    );
  }

  /**
   * Creates an AuthenticationError for OAuth2 invalid_request error
   */
  public static invalidRequest(
    description?: string,
    cause?: Error,
  ): AuthenticationError {
    const message = description
      ? `Invalid OAuth2 request: ${description}`
      : 'The request is missing a required parameter, includes an invalid parameter value, or is otherwise malformed';
    return new AuthenticationError(
      message,
      OAuth2ErrorCode.INVALID_REQUEST,
      cause,
    );
  }

  /**
   * Creates an AuthenticationError for OAuth2 invalid_client error
   */
  public static invalidClient(cause?: Error): AuthenticationError {
    return new AuthenticationError(
      'Client authentication failed',
      OAuth2ErrorCode.INVALID_CLIENT,
      cause,
    );
  }

  /**
   * Creates an AuthenticationError for OAuth2 invalid_grant error
   */
  public static invalidGrant(
    description?: string,
    cause?: Error,
  ): AuthenticationError {
    const message = description
      ? `Invalid grant: ${description}`
      : 'The provided authorization grant is invalid, expired, revoked, or does not match the redirection URI';
    return new AuthenticationError(
      message,
      OAuth2ErrorCode.INVALID_GRANT,
      cause,
    );
  }

  /**
   * Creates an AuthenticationError for OAuth2 access_denied error
   */
  public static accessDenied(cause?: Error): AuthenticationError {
    return new AuthenticationError(
      'The resource owner or authorization server denied the request',
      OAuth2ErrorCode.ACCESS_DENIED,
      cause,
    );
  }

  /**
   * Creates an AuthenticationError for network-related authentication failures
   */
  public static networkError(
    message: string,
    cause?: Error,
  ): AuthenticationError {
    return new AuthenticationError(
      `Network error during authentication: ${message}`,
      AuthErrorCode.NETWORK_ERROR,
      cause,
    );
  }

  /**
   * Convert the error to a JSON representation (useful for logging/debugging)
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}
