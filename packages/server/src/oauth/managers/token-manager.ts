/**
 * Token management for OAuth provider
 * Handles creation, validation, and lifecycle of OAuth tokens
 */

import type {
  IOAuthProviderStorage,
  OAuthProviderConfig,
  AccessToken,
  RefreshToken,
  OAuthError,
} from '../../types/oauth-provider.js';

import {
  generateAccessToken,
  generateRefreshToken,
  getCurrentTimestamp,
  isExpired,
  parseScopes,
  formatScopes,
} from '../utils/oauth-utils.js';

import { OAuthErrorCodes } from '../../types/oauth-provider.js';

export interface TokenGenerationResult {
  accessToken: AccessToken;
  refreshToken?: RefreshToken;
}

export interface TokenValidationResult {
  valid: boolean;
  tokenData?: AccessToken;
  error?: string;
}

export interface TokenRevocationResult {
  success: boolean;
  error?: string;
}

/**
 * Manages OAuth token lifecycle and operations
 */
export class TokenManager {
  constructor(
    private storage: IOAuthProviderStorage,
    private config: OAuthProviderConfig,
  ) {}

  /**
   * Generate access token with optional refresh token
   */
  async generateTokens(
    clientId: string,
    userId: string,
    scopes: string[],
    includeRefreshToken: boolean = true,
  ): Promise<TokenGenerationResult> {
    const issuedAt = getCurrentTimestamp();

    const accessToken: AccessToken = {
      token: generateAccessToken(),
      client_id: clientId,
      user_id: userId,
      scopes,
      expires_at: issuedAt + this.config.defaultTokenExpiry,
      created_at: issuedAt,
      token_type: 'Bearer',
    };

    await this.storage.saveAccessToken(accessToken);

    const result: TokenGenerationResult = { accessToken };

    if (includeRefreshToken && this.config.issueRefreshTokens) {
      const refreshToken = this.generateRefreshTokenRecord(
        clientId,
        userId,
        scopes,
      );
      await this.storage.saveRefreshToken(refreshToken);
      result.refreshToken = refreshToken;
    }

    return result;
  }

  /**
   * Generate a refresh token record
   */
  private generateRefreshTokenRecord(
    clientId: string,
    userId: string,
    scopes: string[],
  ): RefreshToken {
    const issuedAt = getCurrentTimestamp();
    const expiresIn = this.config.defaultRefreshTokenExpiry ?? 2592000;
    return {
      token: generateRefreshToken(),
      client_id: clientId,
      user_id: userId,
      scopes,
      expires_at: issuedAt + expiresIn,
      created_at: issuedAt,
    };
  }

  /**
   * Validate and retrieve access token
   */
  async validateAccessToken(token: string): Promise<TokenValidationResult> {
    const tokenData = await this.storage.getAccessToken(token);
    if (!tokenData) {
      return { valid: false, error: 'Token not found' };
    }

    if (isExpired(tokenData.expires_at)) {
      await this.storage.deleteAccessToken(token);
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, tokenData };
  }

  /**
   * Validate refresh token and check expiration
   */
  async validateRefreshToken(token: string): Promise<{
    valid: boolean;
    tokenData?: RefreshToken;
    error?: OAuthError;
  }> {
    const refreshTokenData = await this.storage.getRefreshToken(token);
    if (!refreshTokenData) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Invalid refresh token',
        },
      };
    }

    // Check if refresh token is expired
    if (
      refreshTokenData.expires_at > 0 &&
      isExpired(refreshTokenData.expires_at)
    ) {
      await this.storage.deleteRefreshToken(token);
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Refresh token expired',
        },
      };
    }

    return { valid: true, tokenData: refreshTokenData };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
    clientId: string,
    requestedScope?: string,
  ): Promise<{
    success: boolean;
    tokens?: TokenGenerationResult;
    error?: OAuthError;
  }> {
    const validation = await this.validateRefreshToken(refreshToken);
    if (!validation.valid || !validation.tokenData) {
      return { success: false, error: validation.error };
    }

    const refreshTokenData = validation.tokenData;

    // Validate client matches
    if (refreshTokenData.client_id !== clientId) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Refresh token was not issued to this client',
        },
      };
    }

    // Handle scope parameter
    let grantedScopes = refreshTokenData.scopes;
    if (requestedScope) {
      const requestedScopes = parseScopes(requestedScope);
      // Requested scopes must be a subset of original scopes
      if (!requestedScopes.every((s) => refreshTokenData.scopes.includes(s))) {
        return {
          success: false,
          error: {
            error: OAuthErrorCodes.INVALID_SCOPE,
            error_description: 'Requested scope exceeds original grant',
          },
        };
      }
      grantedScopes = requestedScopes;
    }

    // Generate new access token
    const tokens = await this.generateTokens(
      clientId,
      refreshTokenData.user_id,
      grantedScopes,
      false, // Don't generate new refresh token yet
    );

    // Handle refresh token rotation if configured
    if (this.config.requireTokenRotation && this.config.issueRefreshTokens) {
      const newRefreshToken = this.generateRefreshTokenRecord(
        clientId,
        refreshTokenData.user_id,
        grantedScopes,
      );
      await this.storage.saveRefreshToken(newRefreshToken);
      await this.storage.deleteRefreshToken(refreshToken);
      tokens.refreshToken = newRefreshToken;
    }

    return { success: true, tokens };
  }

  /**
   * Revoke a token (access or refresh)
   */
  async revokeToken(
    token: string,
    clientId: string,
  ): Promise<TokenRevocationResult> {
    // Try to find as access token first
    const accessToken = await this.storage.getAccessToken(token);
    if (accessToken) {
      if (accessToken.client_id !== clientId) {
        return { success: false, error: 'Token not owned by client' };
      }
      await this.storage.deleteAccessToken(token);
      return { success: true };
    }

    // Try to find as refresh token
    const refreshToken = await this.storage.getRefreshToken(token);
    if (refreshToken) {
      if (refreshToken.client_id !== clientId) {
        return { success: false, error: 'Token not owned by client' };
      }
      await this.storage.deleteRefreshToken(token);
      return { success: true };
    }

    // Token not found - this is not an error per RFC 7009
    return { success: true };
  }

  /**
   * Create token response object for API responses
   */
  createTokenResponse(
    tokens: TokenGenerationResult,
    scopes: string[],
  ): {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    scope: string;
    refresh_token?: string;
  } {
    const response = {
      access_token: tokens.accessToken.token,
      token_type: 'Bearer' as const,
      expires_in: this.config.defaultTokenExpiry,
      scope: formatScopes(scopes),
    };

    if (tokens.refreshToken) {
      return { ...response, refresh_token: tokens.refreshToken.token };
    }

    return response;
  }
}
