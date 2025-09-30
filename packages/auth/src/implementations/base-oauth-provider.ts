import {
  AuthenticationError,
  OAuth2ErrorCode,
  AuthErrorCode,
} from '../errors/authentication-error.js';
import {
  type IAuthProvider,
  type ITokenStorage,
  logEvent,
  RequestUtils,
  type TokenData,
} from '@mcp-funnel/core';
import type { OAuth2TokenResponse } from '../utils/oauth-types.js';
import {
  AUTH_DEFAULT_EXPIRY_SECONDS,
  AUTH_MAX_RETRIES,
  AUTH_RETRY_DELAY_MS,
} from '../utils/oauth-types.js';
import { OAuthErrorUtils, TokenUtils } from '../utils/index.js';

/**
 * Base OAuth provider implementing shared functionality for all OAuth flows
 *
 * Provides common implementation for:
 * - Token validation and header generation
 * - Token storage integration
 * - Refresh logic with retry handling
 * - Proactive refresh scheduling
 * - Error handling and request correlation
 * @public
 */
export abstract class BaseOAuthProvider implements IAuthProvider {
  protected readonly storage: ITokenStorage;
  private refreshPromise?: Promise<void>;
  private readonly BUFFER_TIME_MS = 5 * 60 * 1000; // 5 minutes

  public constructor(storage: ITokenStorage) {
    this.storage = storage;
  }

  /**
   * Returns authentication headers for requests
   * @returns Promise resolving to headers object with Authorization header
   * @throws {AuthenticationError} When token acquisition fails
   * @public
   */
  public async getHeaders(): Promise<Record<string, string>> {
    const token = await this.ensureValidToken();
    return {
      Authorization: `${token.tokenType} ${token.accessToken}`,
    };
  }

  /**
   * Checks if the current authentication state is valid
   * @returns Promise resolving to true if token exists and is not expired
   * @public
   */
  public async isValid(): Promise<boolean> {
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
   * @returns Promise that resolves when token refresh is complete
   * @throws {AuthenticationError} When token acquisition fails
   * @public
   */
  public async refresh(): Promise<void> {
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
   * @returns Promise resolving to valid token data
   * @throws {AuthenticationError} When token acquisition fails
   * @protected
   */
  protected async ensureValidToken(): Promise<TokenData> {
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
   * Schedules proactive token refresh 5 minutes before expiry
   * @param tokenData - Token data containing expiry information
   * @internal
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
   * Makes token request with retry logic for network errors
   * @param makeTokenRequest - Function that executes the token request
   * @param requestId - Unique identifier for request correlation and logging
   * @returns Promise resolving to OAuth2 token response
   * @throws {AuthenticationError} When all retry attempts fail or non-retryable error occurs
   * @protected
   */
  protected async requestTokenWithRetry(
    makeTokenRequest: () => Promise<OAuth2TokenResponse>,
    requestId: string,
  ): Promise<OAuth2TokenResponse> {
    let lastError: Error;

    for (let attempt = 1; attempt <= AUTH_MAX_RETRIES; attempt++) {
      try {
        return await makeTokenRequest();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on network errors, not OAuth2 errors
        if (
          OAuthErrorUtils.isRetryableError(lastError) &&
          attempt < AUTH_MAX_RETRIES
        ) {
          const delayMs = AUTH_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
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
   * Processes and stores a token response
   * @param tokenResponse - Raw OAuth2 token response from authorization server
   * @param requestId - Unique identifier for request correlation and logging
   * @param validateAudience - Optional function to validate token audience claim
   * @returns Promise that resolves when token is processed and stored
   * @throws {AuthenticationError} When audience validation fails
   * @protected
   */
  protected async processTokenResponse(
    tokenResponse: OAuth2TokenResponse,
    requestId: string,
    validateAudience?: (audience: string) => boolean,
  ): Promise<void> {
    const tokenData = TokenUtils.parseTokenResponse(
      tokenResponse,
      AUTH_DEFAULT_EXPIRY_SECONDS,
    );

    // Validate audience if provided
    if (
      validateAudience &&
      tokenResponse.audience &&
      !validateAudience(tokenResponse.audience)
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
   * Handles token request errors with proper error mapping
   * @param error - Error that occurred during token request
   * @param response - Optional HTTP response object for extracting error details
   * @returns Never returns normally, always throws
   * @throws {AuthenticationError} Mapped authentication error based on error type
   * @protected
   */
  protected async handleTokenRequestError(
    error: unknown,
    response?: Response,
  ): Promise<never> {
    if (error instanceof AuthenticationError) {
      throw error;
    }

    // Handle fetch response errors
    if (response && !response.ok) {
      const errorResponse = await OAuthErrorUtils.parseErrorResponse(response);
      throw OAuthErrorUtils.createOAuth2Error(errorResponse, response.status);
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

  /**
   * Validates required fields in token response
   * @param tokenResponse - OAuth2 token response to validate
   * @throws {AuthenticationError} When access_token field is missing
   * @protected
   */
  protected validateTokenResponse(tokenResponse: OAuth2TokenResponse): void {
    if (!tokenResponse.access_token) {
      throw new AuthenticationError(
        'OAuth2 token response missing access_token field',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }
  }

  /**
   * Generates a unique request ID for correlation
   * @returns Unique request identifier for tracking and logging
   * @protected
   */
  protected generateRequestId(): string {
    return RequestUtils.generateRequestId();
  }

  /**
   * Abstract method for acquiring tokens - must be implemented by subclasses
   * @returns Promise that resolves when token acquisition is complete
   * @throws {AuthenticationError} When token acquisition fails
   * @protected
   */
  protected abstract acquireToken(): Promise<void>;
}
