import { randomUUID } from 'crypto';
import type { IAuthProvider, ITokenStorage, TokenData } from '../index.js';
import type { OAuth2ClientCredentialsConfigZod } from '../../config.js';
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
  resolveOAuth2ClientCredentialsConfig,
  parseErrorResponse,
  createOAuth2Error,
  parseTokenResponse,
  isRetryableError,
} from '../utils/oauth-utils.js';

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

  constructor(
    config: OAuth2ClientCredentialsConfigZod,
    storage: ITokenStorage,
  ) {
    this.config = resolveOAuth2ClientCredentialsConfig(config);
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
      tokenEndpoint: this.config.tokenEndpoint,
      clientId: this.config.clientId,
      hasScope: !!this.config.scope,
      hasAudience: !!this.config.audience,
    });

    const tokenResponse = await this.requestTokenWithRetry(requestId);
    const tokenData = parseTokenResponse(tokenResponse, DEFAULT_EXPIRY_SECONDS);

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

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.makeTokenRequest(requestId);
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
      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
          'X-Request-ID': requestId,
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorResponse = await parseErrorResponse(response);
        throw createOAuth2Error(errorResponse, response.status);
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

    if (!this.config.tokenEndpoint) {
      throw new AuthenticationError(
        'OAuth2 token URL is required',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    // Validate URL format
    try {
      new URL(this.config.tokenEndpoint);
    } catch {
      throw new AuthenticationError(
        'OAuth2 token URL is not a valid URL',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }
  }
}
