import type { OAuth2ClientCredentialsConfigZod } from '../schemas.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
} from '../errors/authentication-error.js';
import {
  type ITokenStorage,
  logEvent,
  ValidationUtils,
} from '@mcp-funnel/core';
import type { OAuth2TokenResponse } from '../utils/oauth-types.js';
import { BaseOAuthProvider } from './base-oauth-provider.js';
import { resolveOAuth2ClientCredentialsConfig } from '../utils/oauth-utils.js';

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
 * @example
 * ```typescript
 * import { OAuth2ClientCredentialsProvider } from './oauth2-client-credentials.js';
 * import { MemoryTokenStorage } from './memory-token-storage.js';
 *
 * const config = {
 *   type: 'oauth2-client',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   tokenEndpoint: 'https://auth.example.com/oauth/token',
 *   scope: 'api:read api:write',
 *   audience: 'https://api.example.com'
 * };
 *
 * const storage = new MemoryTokenStorage();
 * const provider = new OAuth2ClientCredentialsProvider(config, storage);
 *
 * // Use the provider to get authentication headers
 * const headers = await provider.getHeaders();
 * ```
 * @public
 * @see file:./base-oauth-provider.ts - Base OAuth provider implementation
 * @see file:../schemas.ts:4-11 - OAuth2ClientCredentialsConfigZod type definition
 */
export class OAuth2ClientCredentialsProvider extends BaseOAuthProvider {
  private readonly config: OAuth2ClientCredentialsConfigZod;

  /**
   * Creates an OAuth2 Client Credentials provider
   * @param config - OAuth2 client credentials configuration with clientId, clientSecret, and tokenEndpoint
   * @param storage - Token storage implementation for persisting tokens
   * @throws {AuthenticationError} When required configuration fields are missing or invalid
   */
  public constructor(
    config: OAuth2ClientCredentialsConfigZod,
    storage: ITokenStorage,
  ) {
    super(storage);
    this.config = resolveOAuth2ClientCredentialsConfig(config);

    // Validate required configuration
    this.validateConfig();
  }

  /**
   * Acquires a new OAuth2 token using client credentials flow
   *
   * Makes a POST request to the token endpoint with client credentials in Basic Auth header.
   * Automatically retries on network errors and validates the response before storing.
   * @throws {AuthenticationError} When token request fails, credentials are invalid, or audience validation fails
   * @protected
   */
  protected async acquireToken(): Promise<void> {
    const requestId = this.generateRequestId();

    logEvent('debug', 'auth:token_request_start', {
      requestId,
      tokenEndpoint: this.config.tokenEndpoint,
      clientId: this.config.clientId,
      hasScope: !!this.config.scope,
      hasAudience: !!this.config.audience,
    });

    const tokenResponse = await this.requestTokenWithRetry(
      () => this.makeTokenRequest(requestId),
      requestId,
    );

    // Validate audience if configured
    const validateAudience = this.config.audience
      ? (audience: string) => audience === this.config.audience
      : undefined;

    await this.processTokenResponse(tokenResponse, requestId, validateAudience);
  }

  /**
   * Makes the actual OAuth2 token request
   *
   * Constructs form-encoded request body with grant_type, scope, and audience.
   * Uses HTTP Basic Authentication with base64-encoded client credentials.
   * @param requestId - Unique identifier for request correlation and logging
   * @returns Promise resolving to OAuth2 token response containing access_token and metadata
   * @throws {AuthenticationError} When request fails, response is invalid, or server returns error
   * @internal
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
        await this.handleTokenRequestError(undefined, response);
      }

      const tokenResponse = (await response.json()) as OAuth2TokenResponse;

      // Validate required fields
      this.validateTokenResponse(tokenResponse);

      return tokenResponse;
    } catch (error) {
      // handleTokenRequestError always throws, execution never continues past this point
      return await this.handleTokenRequestError(error);
    }
  }

  /**
   * Validates the configuration has required fields
   *
   * Ensures clientId, clientSecret, and tokenEndpoint are present and that
   * tokenEndpoint is a valid URL format.
   * @throws {AuthenticationError} When required fields are missing or tokenEndpoint is not a valid URL
   * @internal
   */
  private validateConfig(): void {
    try {
      // Validate required fields
      ValidationUtils.validateRequired(
        this.config,
        ['clientId', 'clientSecret', 'tokenEndpoint'],
        'OAuth2 Client Credentials config',
      );

      // Validate URL format
      ValidationUtils.validateUrl(
        this.config.tokenEndpoint,
        'OAuth2 token URL',
      );
    } catch (error) {
      throw new AuthenticationError(
        error instanceof Error
          ? error.message
          : 'Configuration validation failed',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }
  }
}
