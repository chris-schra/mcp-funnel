/**
 * OAuth 2.0 Authorization Server implementation for mcp-funnel
 * Implements RFC 6749 OAuth 2.0 Authorization Framework
 */

import type {
  IOAuthProviderStorage,
  IUserConsentService,
  OAuthProviderConfig,
  ClientRegistration,
  AuthorizationRequest,
  AuthorizationCode,
  TokenRequest,
  TokenResponse,
  AccessToken,
  RefreshToken,
  OAuthError,
} from '../types/oauth-provider.js';

import {
  OAuthErrorCodes,
  GrantTypes,
  ResponseTypes,
} from '../types/oauth-provider.js';

import {
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken,
  generateClientId,
  generateClientSecret,
  validateAuthorizationRequest,
  validateTokenRequest,
  validateClientCredentials,
  validateRedirectUri,
  validatePkceChallenge,
  parseScopes,
  formatScopes,
  validateScopes,
  getCurrentTimestamp,
  isExpired,
} from './utils/oauth-utils.js';

export class OAuthProvider {
  constructor(
    private storage: IOAuthProviderStorage,
    private consentService: IUserConsentService,
    private config: OAuthProviderConfig,
  ) {}

  /**
   * Register a new OAuth client
   */
  async registerClient(metadata: {
    client_name?: string;
    redirect_uris: string[];
    grant_types?: string[];
    response_types?: string[];
    scope?: string;
  }): Promise<ClientRegistration> {
    const client: ClientRegistration = {
      client_id: generateClientId(),
      client_secret: generateClientSecret(),
      client_name: metadata.client_name,
      redirect_uris: metadata.redirect_uris,
      grant_types: metadata.grant_types || [GrantTypes.AUTHORIZATION_CODE],
      response_types: metadata.response_types || [ResponseTypes.CODE],
      scope: metadata.scope,
      client_id_issued_at: getCurrentTimestamp(),
      client_secret_expires_at: 0, // Never expires for now
    };

    await this.storage.saveClient(client);
    return client;
  }

  /**
   * Handle authorization request (GET /authorize)
   */
  async handleAuthorizationRequest(
    params: Partial<AuthorizationRequest>,
    userId: string, // Assumes user is already authenticated
  ): Promise<{
    success: boolean;
    authorizationCode?: string;
    redirectUri?: string;
    state?: string;
    error?: OAuthError;
  }> {
    // Validate request parameters
    const validation = validateAuthorizationRequest(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const {
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = params as AuthorizationRequest;

    // Get client information
    const client = await this.storage.getClient(client_id);
    if (!client) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client_id',
        },
      };
    }

    // Validate redirect URI
    if (!validateRedirectUri(client, redirect_uri)) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'Invalid redirect_uri',
        },
      };
    }

    // Parse and validate scopes
    const requestedScopes = parseScopes(scope);
    if (!validateScopes(requestedScopes, this.config.supportedScopes)) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_SCOPE,
          error_description: 'Invalid scope',
        },
      };
    }

    // Check PKCE requirements for public clients
    if (!client.client_secret && this.config.requirePkce && !code_challenge) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'PKCE is required for public clients',
        },
      };
    }

    // Check user consent
    const hasConsent = await this.consentService.hasUserConsented(
      userId,
      client_id,
      requestedScopes,
    );

    if (!hasConsent) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.CONSENT_REQUIRED,
          error_description:
            'User consent is required for the requested scopes',
          consent_uri: `/api/oauth/consent?client_id=${encodeURIComponent(client_id)}&scope=${encodeURIComponent(scope || '')}&state=${state || ''}`,
        },
      };
    }

    // Generate authorization code
    const code = generateAuthorizationCode();
    const authCode: AuthorizationCode = {
      code,
      client_id,
      user_id: userId,
      redirect_uri,
      scopes: requestedScopes,
      code_challenge,
      code_challenge_method,
      state,
      expires_at: getCurrentTimestamp() + this.config.defaultCodeExpiry,
      created_at: getCurrentTimestamp(),
    };

    await this.storage.saveAuthorizationCode(authCode);

    return {
      success: true,
      authorizationCode: code,
      redirectUri: redirect_uri,
      state,
    };
  }

  /**
   * Handle token request (POST /token)
   */
  async handleTokenRequest(params: Partial<TokenRequest>): Promise<{
    success: boolean;
    tokenResponse?: TokenResponse;
    error?: OAuthError;
  }> {
    // Validate request parameters
    const validation = validateTokenRequest(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { grant_type } = params as TokenRequest;

    if (grant_type === GrantTypes.AUTHORIZATION_CODE) {
      return this.handleAuthorizationCodeGrant(params as TokenRequest);
    } else if (grant_type === GrantTypes.REFRESH_TOKEN) {
      return this.handleRefreshTokenGrant(params as TokenRequest);
    }

    return {
      success: false,
      error: {
        error: OAuthErrorCodes.UNSUPPORTED_GRANT_TYPE,
        error_description: `Unsupported grant type: ${grant_type}`,
      },
    };
  }

  /**
   * Handle authorization code grant
   */
  private async handleAuthorizationCodeGrant(params: TokenRequest): Promise<{
    success: boolean;
    tokenResponse?: TokenResponse;
    error?: OAuthError;
  }> {
    const { code, redirect_uri, client_id, client_secret, code_verifier } =
      params;

    // Get client
    const client = await this.storage.getClient(client_id);
    if (!client) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client_id',
        },
      };
    }

    // Validate client credentials
    if (!validateClientCredentials(client, client_secret)) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client credentials',
        },
      };
    }

    // Get authorization code
    const authCode = await this.storage.getAuthorizationCode(code!);
    if (!authCode) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Invalid authorization code',
        },
      };
    }

    // Check if code is expired
    if (isExpired(authCode.expires_at)) {
      await this.storage.deleteAuthorizationCode(code!);
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Authorization code expired',
        },
      };
    }

    // Validate client matches
    if (authCode.client_id !== client_id) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Authorization code was not issued to this client',
        },
      };
    }

    // Validate redirect URI matches
    if (authCode.redirect_uri !== redirect_uri) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Invalid redirect_uri',
        },
      };
    }

    // Validate PKCE if present
    if (authCode.code_challenge) {
      if (!code_verifier) {
        return {
          success: false,
          error: {
            error: OAuthErrorCodes.INVALID_REQUEST,
            error_description: 'code_verifier is required',
          },
        };
      }

      if (
        !validatePkceChallenge(
          code_verifier,
          authCode.code_challenge,
          authCode.code_challenge_method || 'plain',
        )
      ) {
        return {
          success: false,
          error: {
            error: OAuthErrorCodes.INVALID_GRANT,
            error_description: 'Invalid PKCE code verifier',
          },
        };
      }
    }

    // Delete authorization code (single use)
    await this.storage.deleteAuthorizationCode(code!);

    // Generate access token
    const accessToken: AccessToken = {
      token: generateAccessToken(),
      client_id,
      user_id: authCode.user_id,
      scopes: authCode.scopes,
      expires_at: getCurrentTimestamp() + this.config.defaultTokenExpiry,
      created_at: getCurrentTimestamp(),
      token_type: 'Bearer',
    };

    await this.storage.saveAccessToken(accessToken);

    // Generate refresh token if enabled
    let refreshToken: RefreshToken | undefined;
    if (this.config.issueRefreshTokens) {
      refreshToken = {
        token: generateRefreshToken(),
        client_id,
        user_id: authCode.user_id,
        scopes: authCode.scopes,
        expires_at: 0, // Never expires for now
        created_at: getCurrentTimestamp(),
      };

      await this.storage.saveRefreshToken(refreshToken);
    }

    const tokenResponse: TokenResponse = {
      access_token: accessToken.token,
      token_type: 'Bearer',
      expires_in: this.config.defaultTokenExpiry,
      scope: formatScopes(authCode.scopes),
    };

    if (refreshToken) {
      tokenResponse.refresh_token = refreshToken.token;
    }

    return { success: true, tokenResponse };
  }

  /**
   * Handle refresh token grant
   */
  private async handleRefreshTokenGrant(params: TokenRequest): Promise<{
    success: boolean;
    tokenResponse?: TokenResponse;
    error?: OAuthError;
  }> {
    const { refresh_token, client_id, client_secret, scope } = params;

    // Get client
    const client = await this.storage.getClient(client_id);
    if (!client) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client_id',
        },
      };
    }

    // Validate client credentials
    if (!validateClientCredentials(client, client_secret)) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client credentials',
        },
      };
    }

    // Get refresh token
    const refreshTokenData = await this.storage.getRefreshToken(refresh_token!);
    if (!refreshTokenData) {
      return {
        success: false,
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
      await this.storage.deleteRefreshToken(refresh_token!);
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Refresh token expired',
        },
      };
    }

    // Validate client matches
    if (refreshTokenData.client_id !== client_id) {
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
    if (scope) {
      const requestedScopes = parseScopes(scope);
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
    const accessToken: AccessToken = {
      token: generateAccessToken(),
      client_id,
      user_id: refreshTokenData.user_id,
      scopes: grantedScopes,
      expires_at: getCurrentTimestamp() + this.config.defaultTokenExpiry,
      created_at: getCurrentTimestamp(),
      token_type: 'Bearer',
    };

    await this.storage.saveAccessToken(accessToken);

    const tokenResponse: TokenResponse = {
      access_token: accessToken.token,
      token_type: 'Bearer',
      expires_in: this.config.defaultTokenExpiry,
      scope: formatScopes(grantedScopes),
    };

    return { success: true, tokenResponse };
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<{
    valid: boolean;
    tokenData?: AccessToken;
    error?: string;
  }> {
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
   * Revoke token (access or refresh)
   */
  async revokeToken(
    token: string,
    clientId: string,
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
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
   * Get OAuth metadata
   */
  getMetadata() {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: `${this.config.baseUrl}/authorize`,
      token_endpoint: `${this.config.baseUrl}/token`,
      revocation_endpoint: `${this.config.baseUrl}/revoke`,
      scopes_supported: this.config.supportedScopes,
      response_types_supported: [ResponseTypes.CODE],
      grant_types_supported: [
        GrantTypes.AUTHORIZATION_CODE,
        GrantTypes.REFRESH_TOKEN,
      ],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      code_challenge_methods_supported: ['plain', 'S256'],
    };
  }

  /**
   * Cleanup expired tokens
   */
  async cleanup(): Promise<void> {
    await this.storage.cleanupExpiredTokens();
  }
}
