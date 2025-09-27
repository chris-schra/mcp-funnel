/**
 * OAuth 2.0 Grant Type Handlers
 * Implements specific grant type logic following SEAMS principle for extensibility
 */

import type {
  IOAuthProviderStorage,
  OAuthProviderConfig,
  TokenRequest,
  TokenResponse,
  OAuthError,
  AuthorizationCode,
  ClientRegistration,
} from '../../types/oauth-provider.js';

import { OAuthErrorCodes, GrantTypes } from '../../types/oauth-provider.js';

import {
  validateClientCredentials,
  validatePkceChallenge,
  isExpired,
} from '../utils/oauth-utils.js';

import { TokenManager } from '../managers/token-manager.js';

/**
 * Common interface for all grant type handlers
 * SEAM: Allows easy extension for new grant types (client_credentials, device_code, etc.)
 */
export interface IGrantHandler {
  readonly grantType: string;
  handleGrant(params: TokenRequest): Promise<{
    success: boolean;
    tokenResponse?: TokenResponse;
    error?: OAuthError;
  }>;
}

/**
 * Base class providing common functionality for grant handlers
 */
abstract class BaseGrantHandler implements IGrantHandler {
  constructor(
    protected storage: IOAuthProviderStorage,
    protected config: OAuthProviderConfig,
    protected tokenManager: TokenManager,
  ) {}

  abstract readonly grantType: string;
  abstract handleGrant(params: TokenRequest): Promise<{
    success: boolean;
    tokenResponse?: TokenResponse;
    error?: OAuthError;
  }>;

  /**
   * Common client validation logic
   */
  protected async validateClient(
    clientId: string,
    clientSecret?: string,
  ): Promise<{
    valid: boolean;
    client?: ClientRegistration;
    error?: OAuthError;
  }> {
    const client = await this.storage.getClient(clientId);
    if (!client) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client_id',
        },
      };
    }

    if (!validateClientCredentials(client, clientSecret)) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client credentials',
        },
      };
    }

    return { valid: true, client };
  }
}

/**
 * Authorization Code Grant Handler
 * Implements RFC 6749 Section 4.1
 */
export class AuthorizationCodeGrantHandler extends BaseGrantHandler {
  readonly grantType = GrantTypes.AUTHORIZATION_CODE;

  async handleGrant(params: TokenRequest): Promise<{
    success: boolean;
    tokenResponse?: TokenResponse;
    error?: OAuthError;
  }> {
    const { code, redirect_uri, client_id, client_secret, code_verifier } =
      params;

    // Validate client
    const clientValidation = await this.validateClient(
      client_id,
      client_secret,
    );
    if (!clientValidation.valid) {
      return { success: false, error: clientValidation.error };
    }

    // Get and validate authorization code
    const authCodeValidation = await this.validateAuthorizationCode(
      code!,
      client_id,
      redirect_uri!,
      code_verifier,
    );
    if (!authCodeValidation.valid) {
      return { success: false, error: authCodeValidation.error };
    }

    const authCode = authCodeValidation.authCode!;

    // Delete authorization code (single use)
    await this.storage.deleteAuthorizationCode(code!);

    // Generate tokens
    const tokens = await this.tokenManager.generateTokens(
      client_id,
      authCode.user_id,
      authCode.scopes,
      this.config.issueRefreshTokens,
    );

    const tokenResponse = this.tokenManager.createTokenResponse(
      tokens,
      authCode.scopes,
    );

    return { success: true, tokenResponse };
  }

  /**
   * Validate authorization code and associated parameters
   */
  private async validateAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<{
    valid: boolean;
    authCode?: AuthorizationCode;
    error?: OAuthError;
  }> {
    const authCode = await this.storage.getAuthorizationCode(code);
    if (!authCode) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Invalid authorization code',
        },
      };
    }

    // Check if code is expired
    if (isExpired(authCode.expires_at)) {
      await this.storage.deleteAuthorizationCode(code);
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Authorization code expired',
        },
      };
    }

    // Validate client matches
    if (authCode.client_id !== clientId) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Authorization code was not issued to this client',
        },
      };
    }

    // Validate redirect URI matches
    if (authCode.redirect_uri !== redirectUri) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Invalid redirect_uri',
        },
      };
    }

    // Validate PKCE if present
    if (authCode.code_challenge) {
      if (!codeVerifier) {
        return {
          valid: false,
          error: {
            error: OAuthErrorCodes.INVALID_REQUEST,
            error_description: 'code_verifier is required',
          },
        };
      }

      if (
        !validatePkceChallenge(
          codeVerifier,
          authCode.code_challenge,
          authCode.code_challenge_method || 'plain',
        )
      ) {
        return {
          valid: false,
          error: {
            error: OAuthErrorCodes.INVALID_GRANT,
            error_description: 'Invalid PKCE code verifier',
          },
        };
      }
    }

    return { valid: true, authCode };
  }
}

/**
 * Refresh Token Grant Handler
 * Implements RFC 6749 Section 6
 */
export class RefreshTokenGrantHandler extends BaseGrantHandler {
  readonly grantType = GrantTypes.REFRESH_TOKEN;

  async handleGrant(params: TokenRequest): Promise<{
    success: boolean;
    tokenResponse?: TokenResponse;
    error?: OAuthError;
  }> {
    const { refresh_token, client_id, client_secret, scope } = params;

    // Validate client
    const clientValidation = await this.validateClient(
      client_id,
      client_secret,
    );
    if (!clientValidation.valid) {
      return { success: false, error: clientValidation.error };
    }

    // Use token manager to refresh the token
    const refreshResult = await this.tokenManager.refreshAccessToken(
      refresh_token!,
      client_id,
      scope,
    );

    if (!refreshResult.success) {
      return { success: false, error: refreshResult.error };
    }

    // Determine the scopes for response
    const refreshTokenData = await this.storage.getRefreshToken(refresh_token!);
    const grantedScopes = scope
      ? scope.split(' ').filter(Boolean)
      : refreshTokenData?.scopes || [];

    const tokenResponse = this.tokenManager.createTokenResponse(
      refreshResult.tokens!,
      grantedScopes,
    );

    return { success: true, tokenResponse };
  }
}

/**
 * Grant Handler Registry
 * SEAM: Allows registration of new grant type handlers
 */
export class GrantHandlerRegistry {
  private handlers = new Map<string, IGrantHandler>();

  constructor(
    storage: IOAuthProviderStorage,
    config: OAuthProviderConfig,
    tokenManager: TokenManager,
  ) {
    // Register default handlers
    this.registerHandler(
      new AuthorizationCodeGrantHandler(storage, config, tokenManager),
    );
    this.registerHandler(
      new RefreshTokenGrantHandler(storage, config, tokenManager),
    );
  }

  /**
   * Register a new grant type handler
   * SEAM: Extension point for new grant types
   */
  registerHandler(handler: IGrantHandler): void {
    this.handlers.set(handler.grantType, handler);
  }

  /**
   * Get handler for a specific grant type
   */
  getHandler(grantType: string): IGrantHandler | undefined {
    return this.handlers.get(grantType);
  }

  /**
   * Get all supported grant types
   */
  getSupportedGrantTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Handle a token request by delegating to appropriate handler
   */
  async handleTokenRequest(params: TokenRequest): Promise<{
    success: boolean;
    tokenResponse?: TokenResponse;
    error?: OAuthError;
  }> {
    const handler = this.getHandler(params.grant_type);
    if (!handler) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.UNSUPPORTED_GRANT_TYPE,
          error_description: `Unsupported grant type: ${params.grant_type}`,
        },
      };
    }

    return handler.handleGrant(params);
  }
}
