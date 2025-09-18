import { randomUUID } from 'crypto';
import type { IAuthProvider, ITokenStorage, TokenData } from '../index.js';
import type { OAuth2ClientCredentialsConfigZod } from '../../config.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
  AuthErrorCode,
} from '../errors/authentication-error.js';
import { logEvent } from '../../logger.js';

/**
 * OAuth2 token response interface following RFC 6749
 */
interface OAuth2TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  audience?: string;
}

/**
 * OAuth2 error response interface following RFC 6749
 */
interface OAuth2ErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * OAuth2 Client Credentials provider implementing IAuthProvider
 *
 * Implements OAuth2 Client Credentials flow (RFC 6749 Section 4.4) with:
 * - Token acquisition and automatic refresh
 * - Proactive refresh scheduling (5 minutes before expiry)
 * - Audience validation for security
 * - Environment variable resolution
 * - Request correlation and retry logic
 * - Secure error handling with token sanitization
 */
export class OAuth2ClientCredentialsProvider implements IAuthProvider {
  private readonly config: OAuth2ClientCredentialsConfigZod;
  private readonly storage: ITokenStorage;
  private refreshPromise?: Promise<void>;
  private readonly BUFFER_TIME_MS = 5 * 60 * 1000; // 5 minutes
  private readonly DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(
    config: OAuth2ClientCredentialsConfigZod,
    storage: ITokenStorage,
  ) {
    this.config = this.resolveEnvironmentVariables(config);
    this.storage = storage;

    // Validate required configuration
    this.validateConfig();
  }

  /**
   * Returns authentication headers for requests
   */
  async getHeaders(): Promise<Record<string, string>> {
    const token = await this.ensureValidToken();
    return {
      Authorization: `${token.tokenType} ${token.accessToken}`,
    };
  }

  /**
   * Checks if the current authentication state is valid
   */
  async isValid(): Promise<boolean> {
    try {
      const token = await this.storage.retrieve();
      if (!token) {
        return false;
      }
      return !(await this.storage.isExpired());
    } catch (error) {
      logEvent('debug', 'auth:token_validation_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Refresh credentials by acquiring a new token
   */
  async refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.acquireToken();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  /**
   * Ensures a valid token is available, acquiring one if necessary
   */
  private async ensureValidToken(): Promise<TokenData> {
    const existingToken = await this.storage.retrieve();

    if (existingToken && !(await this.storage.isExpired())) {
      // Token is valid, schedule proactive refresh if storage supports it
      this.scheduleProactiveRefresh(existingToken);
      return existingToken;
    }

    // Need to acquire or refresh token
    await this.refresh();

    const token = await this.storage.retrieve();
    if (!token) {
      throw new AuthenticationError(
        'Failed to acquire OAuth2 token',
        AuthErrorCode.UNKNOWN_ERROR,
      );
    }

    return token;
  }

  /**
   * Acquires a new OAuth2 token using client credentials flow
   */
  private async acquireToken(): Promise<void> {
    const requestId = randomUUID();

    logEvent('debug', 'auth:token_request_start', {
      requestId,
      tokenUrl: this.config.tokenUrl,
      clientId: this.config.clientId,
      hasScope: !!this.config.scope,
      hasAudience: !!this.config.audience,
    });

    const tokenResponse = await this.requestTokenWithRetry(requestId);
    const tokenData = this.parseTokenResponse(tokenResponse);

    // Validate audience if configured
    if (
      this.config.audience &&
      tokenResponse.audience &&
      tokenResponse.audience !== this.config.audience
    ) {
      throw new AuthenticationError(
        'Audience validation failed: token audience does not match requested audience',
        OAuth2ErrorCode.INVALID_GRANT,
      );
    }

    try {
      await this.storage.store(tokenData);
      logEvent('info', 'auth:token_stored', {
        requestId,
        expiresAt: tokenData.expiresAt.toISOString(),
        scope: tokenData.scope,
      });
    } catch (error) {
      // Log warning but don't fail - we can still return the token
      logEvent('warn', 'auth:token_storage_failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Schedule proactive refresh
    this.scheduleProactiveRefresh(tokenData);

    logEvent('info', 'auth:token_acquired', {
      requestId,
      expiresAt: tokenData.expiresAt.toISOString(),
    });
  }

  /**
   * Makes token request with retry logic for network errors
   */
  private async requestTokenWithRetry(
    requestId: string,
  ): Promise<OAuth2TokenResponse> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await this.makeTokenRequest(requestId);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on network errors, not OAuth2 errors
        if (this.isRetryableError(lastError) && attempt < this.MAX_RETRIES) {
          const delayMs = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          logEvent('warn', 'auth:token_request_retry', {
            requestId,
            attempt,
            error: lastError.message,
            nextAttemptDelayMs: delayMs,
          });

          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        // Re-throw for non-retryable errors or max retries exceeded
        throw lastError;
      }
    }

    throw lastError!;
  }

  /**
   * Makes the actual OAuth2 token request
   */
  private async makeTokenRequest(
    requestId: string,
  ): Promise<OAuth2TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
    });

    if (this.config.scope) {
      body.append('scope', this.config.scope);
    }

    if (this.config.audience) {
      body.append('audience', this.config.audience);
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
          'X-Request-ID': requestId,
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorResponse = await this.parseErrorResponse(response);
        throw this.createOAuth2Error(errorResponse, response.status);
      }

      const tokenResponse = (await response.json()) as OAuth2TokenResponse;

      // Validate required fields
      if (!tokenResponse.access_token) {
        throw new AuthenticationError(
          'OAuth2 token response missing access_token field',
          OAuth2ErrorCode.INVALID_REQUEST,
        );
      }

      return tokenResponse;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        throw new AuthenticationError(
          'Failed to parse OAuth2 token response: invalid JSON',
          AuthErrorCode.UNKNOWN_ERROR,
          error,
        );
      }

      // Handle fetch errors (network, timeout, etc.)
      throw AuthenticationError.networkError(
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Parses error response from OAuth2 server
   */
  private async parseErrorResponse(
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

  /**
   * Creates appropriate AuthenticationError from OAuth2 error response
   */
  private createOAuth2Error(
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

  /**
   * Parses OAuth2 token response into TokenData
   */
  private parseTokenResponse(tokenResponse: OAuth2TokenResponse): TokenData {
    const expiresIn = tokenResponse.expires_in ?? this.DEFAULT_EXPIRY_SECONDS;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const tokenType = tokenResponse.token_type ?? 'Bearer';

    return {
      accessToken: tokenResponse.access_token,
      expiresAt,
      tokenType,
      scope: tokenResponse.scope,
    };
  }

  /**
   * Schedules proactive token refresh 5 minutes before expiry
   */
  private scheduleProactiveRefresh(tokenData: TokenData): void {
    if (!this.storage.scheduleRefresh) {
      return; // Storage doesn't support scheduling
    }

    const refreshTime = new Date(
      tokenData.expiresAt.getTime() - this.BUFFER_TIME_MS,
    );
    const currentTime = new Date();

    // Only schedule if refresh time is in the future
    if (refreshTime > currentTime) {
      this.storage.scheduleRefresh(async () => {
        try {
          logEvent('info', 'auth:token_refresh', {
            reason: 'proactive_refresh',
            originalExpiry: tokenData.expiresAt.toISOString(),
          });
          await this.refresh();
        } catch (error) {
          logEvent('error', 'auth:proactive_refresh_failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  }

  /**
   * Determines if an error is retryable (network errors, not OAuth2 errors)
   */
  private isRetryableError(error: Error): boolean {
    // Network errors that might be transient
    const retryableNetworkErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ENETUNREACH',
      'ECONNABORTED',
    ];

    const errorMessage = error.message.toLowerCase();

    // Check for specific network error codes
    if (
      retryableNetworkErrors.some((code) =>
        errorMessage.includes(code.toLowerCase()),
      )
    ) {
      return true;
    }

    // Check for generic network timeout/reset messages
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('reset') ||
      errorMessage.includes('connection')
    ) {
      return true;
    }

    // Don't retry OAuth2 authentication errors
    if (error instanceof AuthenticationError) {
      return false;
    }

    return false;
  }

  /**
   * Resolves environment variables in configuration
   */
  private resolveEnvironmentVariables(
    config: OAuth2ClientCredentialsConfigZod,
  ): OAuth2ClientCredentialsConfigZod {
    return {
      ...config,
      clientId: this.resolveEnvVar(config.clientId),
      clientSecret: this.resolveEnvVar(config.clientSecret),
      tokenUrl: this.resolveEnvVar(config.tokenUrl),
      scope: config.scope ? this.resolveEnvVar(config.scope) : config.scope,
      audience: config.audience
        ? this.resolveEnvVar(config.audience)
        : config.audience,
    };
  }

  /**
   * Resolves a single environment variable reference
   */
  private resolveEnvVar(value: string): string {
    // Match ${VAR_NAME} pattern
    const envVarMatch = value.match(/^\$\{([^}]+)\}$/);
    if (envVarMatch) {
      const envVarName = envVarMatch[1];
      const envValue = process.env[envVarName];

      if (envValue === undefined) {
        throw new AuthenticationError(
          `Environment variable ${envVarName} is not set`,
          OAuth2ErrorCode.INVALID_REQUEST,
        );
      }

      return envValue;
    }

    return value;
  }

  /**
   * Validates the configuration has required fields
   */
  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new AuthenticationError(
        'OAuth2 client ID is required',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    if (!this.config.clientSecret) {
      throw new AuthenticationError(
        'OAuth2 client secret is required',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    if (!this.config.tokenUrl) {
      throw new AuthenticationError(
        'OAuth2 token URL is required',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    // Validate URL format
    try {
      new URL(this.config.tokenUrl);
    } catch {
      throw new AuthenticationError(
        'OAuth2 token URL is not a valid URL',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }
  }
}
