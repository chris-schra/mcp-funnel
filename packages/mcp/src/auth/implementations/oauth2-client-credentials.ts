import type { ITokenStorage } from '../index.js';
import type { OAuth2ClientCredentialsConfigZod } from '../../config.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
} from '../errors/authentication-error.js';
import { logEvent } from '../../logger.js';
import type { OAuth2TokenResponse } from '../utils/oauth-types.js';
import { resolveOAuth2ClientCredentialsConfig } from '../utils/oauth-utils.js';
import { BaseOAuthProvider } from './base-oauth-provider.js';
import { ValidationUtils } from '../../utils/validation-utils.js';

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
export class OAuth2ClientCredentialsProvider extends BaseOAuthProvider {
  private readonly config: OAuth2ClientCredentialsConfigZod;

  constructor(
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
