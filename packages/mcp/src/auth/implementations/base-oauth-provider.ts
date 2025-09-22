import { randomUUID } from 'crypto';
import type { IAuthProvider, ITokenStorage, TokenData } from '../index.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
  AuthErrorCode,
} from '../errors/authentication-error.js';
import { logEvent } from '../../logger.js';
import type { OAuth2TokenResponse } from '../utils/oauth-types.js';
import {
  DEFAULT_EXPIRY_SECONDS,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from '../utils/oauth-types.js';
import {
  parseErrorResponse,
  createOAuth2Error,
  parseTokenResponse,
  isRetryableError,
} from '../utils/oauth-utils.js';

/**
 * Base OAuth provider implementing shared functionality for all OAuth flows
 *
 * Provides common implementation for:
 * - Token validation and header generation
 * - Token storage integration
 * - Refresh logic with retry handling
 * - Proactive refresh scheduling
 * - Error handling and request correlation
 */
export abstract class BaseOAuthProvider implements IAuthProvider {
  protected readonly storage: ITokenStorage;
  private refreshPromise?: Promise<void>;
  private readonly BUFFER_TIME_MS = 5 * 60 * 1000; // 5 minutes

  constructor(storage: ITokenStorage) {
    this.storage = storage;
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
   */
  protected async requestTokenWithRetry(
    makeTokenRequest: () => Promise<OAuth2TokenResponse>,
    requestId: string,
  ): Promise<OAuth2TokenResponse> {
    let lastError: Error;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await makeTokenRequest();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on network errors, not OAuth2 errors
        if (isRetryableError(lastError) && attempt < MAX_RETRIES) {
          const delayMs = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
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
   */
  protected async processTokenResponse(
    tokenResponse: OAuth2TokenResponse,
    requestId: string,
    validateAudience?: (audience: string) => boolean,
  ): Promise<void> {
    const tokenData = parseTokenResponse(tokenResponse, DEFAULT_EXPIRY_SECONDS);

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
      const errorResponse = await parseErrorResponse(response);
      throw createOAuth2Error(errorResponse, response.status);
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
   */
  protected generateRequestId(): string {
    return randomUUID();
  }

  /**
   * Abstract method for acquiring tokens - must be implemented by subclasses
   */
  protected abstract acquireToken(): Promise<void>;
}
