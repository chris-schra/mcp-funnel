/**
 * OAuth 2.0 Authorization Server implementation for mcp-funnel
 * Implements RFC 6749 OAuth 2.0 Authorization Framework
 */

import { TokenUtils } from './token-utils/index.js';
import { OAuthUtils } from '../utils/index.js';
import {
  type AccessToken,
  type AuthorizationRequest,
  type ClientRegistration,
  GrantTypes,
  type IOAuthProviderStorage,
  type IUserConsentService,
  type OAuthError,
  OAuthErrorCodes,
  type OAuthProviderConfig,
  ResponseTypes,
  type TokenRequest,
  type TokenResponse,
} from '@mcp-funnel/models';

const {
  generateClientId,
  generateClientSecret,
  validateTokenRequest,
  getCurrentTimestamp,
  isExpired,
} = OAuthUtils;

export class OAuthProvider {
  private tokenUtils: TokenUtils;

  public constructor(
    private storage: IOAuthProviderStorage,
    private consentService: IUserConsentService,
    private config: OAuthProviderConfig,
  ) {
    this.tokenUtils = new TokenUtils(this.config, this.storage);
  }

  private generateClientSecretMetadata(): {
    client_secret: string;
    client_secret_expires_at: number;
  } {
    const issuedAt = getCurrentTimestamp();
    const expiresIn = this.config.defaultClientSecretExpiry ?? 31536000;
    return {
      client_secret: generateClientSecret(),
      client_secret_expires_at: issuedAt + expiresIn,
    };
  }

  /**
   * Register a new OAuth client
   */
  public async registerClient(metadata: {
    client_name?: string;
    redirect_uris: string[];
    grant_types?: string[];
    response_types?: string[];
    scope?: string;
  }): Promise<ClientRegistration> {
    const { client_secret, client_secret_expires_at } =
      this.generateClientSecretMetadata();

    const client: ClientRegistration = {
      client_id: generateClientId(),
      client_secret,
      client_name: metadata.client_name,
      redirect_uris: metadata.redirect_uris,
      grant_types: metadata.grant_types || [GrantTypes.AUTHORIZATION_CODE],
      response_types: metadata.response_types || [ResponseTypes.CODE],
      scope: metadata.scope,
      client_id_issued_at: getCurrentTimestamp(),
      client_secret_expires_at,
    };

    await this.storage.saveClient(client);
    return client;
  }

  /**
   * Handle authorization request (GET /authorize)
   */
  public async handleAuthorizationRequest(
    params: Partial<AuthorizationRequest>,
    userId: string, // Assumes user is already authenticated
  ): Promise<{
    success: boolean;
    authorizationCode?: string;
    redirectUri?: string;
    state?: string;
    error?: OAuthError;
  }> {
    return this.tokenUtils.handleAuthorizationRequest(
      this.consentService,
      params,
      userId,
    );
  }

  /**
   * Handle token request (POST /token)
   */
  public async handleTokenRequest(params: Partial<TokenRequest>): Promise<{
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
      return this.tokenUtils.handleAuthorizationCodeGrant(
        params as TokenRequest,
      );
    } else if (grant_type === GrantTypes.REFRESH_TOKEN) {
      return this.tokenUtils.handleRefreshTokenGrant(params as TokenRequest);
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
   * Verify access token
   */
  public async verifyAccessToken(token: string): Promise<{
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

  public async rotateClientSecret(
    clientId: string,
    currentSecret: string,
  ): Promise<{
    success: boolean;
    client?: ClientRegistration;
    error?: OAuthError;
  }> {
    const client = await this.storage.getClient(clientId);

    if (!client) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client_id',
        },
      };
    }

    if (!client.client_secret) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Client does not have a secret to rotate',
        },
      };
    }

    if (client.client_secret !== currentSecret) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client secret',
        },
      };
    }

    const { client_secret, client_secret_expires_at } =
      this.generateClientSecretMetadata();

    const updatedClient: ClientRegistration = {
      ...client,
      client_secret,
      client_secret_expires_at,
    };

    await this.storage.saveClient(updatedClient);

    return { success: true, client: updatedClient };
  }

  /**
   * Revoke token (access or refresh)
   */
  public async revokeToken(
    token: string,
    clientId: string,
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    return this.tokenUtils.revokeToken(token, clientId);
  }

  /**
   * Get OAuth metadata
   */
  public getMetadata() {
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
  public async cleanup(): Promise<void> {
    await this.storage.cleanupExpiredTokens();
  }
}
