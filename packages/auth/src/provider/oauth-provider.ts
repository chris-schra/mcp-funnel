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

/**
 * Metadata for a generated client secret.
 */
type ClientSecretMetadata = {
  client_secret: string;
  client_secret_expires_at: number;
};

/**
 * OAuth 2.0 Authorization Server providing RFC 6749 compliant authorization flows.
 *
 * Implements the core OAuth 2.0 server functionality including client registration,
 * authorization code flow, token issuance, token verification, and token revocation.
 * Supports PKCE (RFC 7636) and refresh tokens.
 * @example
 * ```typescript
 * const storage = new MemoryOAuthStorage();
 * const consentService = new MemoryUserConsentService();
 * const config = {
 *   issuer: 'http://localhost:3000',
 *   baseUrl: 'http://localhost:3000/api/oauth',
 *   defaultTokenExpiry: 3600,
 *   defaultCodeExpiry: 600,
 *   supportedScopes: ['read', 'write'],
 *   requirePkce: true,
 *   issueRefreshTokens: true
 * };
 * const provider = new OAuthProvider(storage, consentService, config);
 * ```
 * @public
 */
export class OAuthProvider {
  private tokenUtils: TokenUtils;

  /**
   * Creates an OAuth provider instance.
   * @param storage - Storage backend for clients, tokens, and authorization codes
   * @param consentService - Service for managing user consent decisions
   * @param config - OAuth provider configuration including issuer, URLs, and policies
   */
  public constructor(
    private storage: IOAuthProviderStorage,
    private consentService: IUserConsentService,
    private config: OAuthProviderConfig,
  ) {
    this.tokenUtils = new TokenUtils(this.config, this.storage);
  }

  private generateClientSecretMetadata(): ClientSecretMetadata {
    const issuedAt = getCurrentTimestamp();
    const expiresIn = this.config.defaultClientSecretExpiry ?? 31536000;
    return {
      client_secret: generateClientSecret(),
      client_secret_expires_at: issuedAt + expiresIn,
    };
  }

  /**
   * Registers a new OAuth 2.0 client with the authorization server.
   *
   * Generates a unique client_id and client_secret, with the secret expiring
   * after one year by default. If grant_types or response_types are omitted,
   * defaults to authorization_code flow.
   *
   * The metadata object includes: client_name (optional human-readable name),
   * redirect_uris (allowed redirect URIs for authorization callbacks),
   * grant_types (optional, defaults to authorization_code), response_types
   * (optional, defaults to code), and scope (optional space-separated scopes).
   * @param metadata - Client registration metadata
   * @returns Promise resolving to the registered client with generated credentials
   */
  public async registerClient(metadata: {
    client_name?: string;
    redirect_uris: string[];
    grant_types?: string[];
    response_types?: string[];
    scope?: string;
  }): Promise<ClientRegistration> {
    const { client_secret, client_secret_expires_at } = this.generateClientSecretMetadata();

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
   * Handles OAuth 2.0 authorization requests (RFC 6749 Section 4.1.1).
   *
   * Validates the authorization request, checks user consent, and generates
   * an authorization code if all checks pass. Supports PKCE code challenge
   * validation. The user must be authenticated before calling this method.
   * @param params - Authorization request parameters
   * @param userId - Authenticated user identifier
   * @returns Promise resolving to authorization result
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
    return this.tokenUtils.handleAuthorizationRequest(this.consentService, params, userId);
  }

  /**
   * Handles OAuth 2.0 token requests (RFC 6749 Section 4.1.3).
   *
   * Processes token requests for both authorization_code and refresh_token grant types.
   * Validates the request parameters, authenticates the client, verifies PKCE if required,
   * and issues access tokens (and optionally refresh tokens) on success.
   * @param params - Token request parameters
   * @returns Promise resolving to token response
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
      return this.tokenUtils.handleAuthorizationCodeGrant(params as TokenRequest);
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
   * Verifies the validity of an access token.
   *
   * Checks if the token exists in storage and has not expired. Expired tokens
   * are automatically deleted from storage during verification.
   * @param token - The access token string to verify
   * @returns Promise resolving to validation result
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

  /**
   * Rotates a client's secret by generating a new one.
   *
   * Validates the current secret before issuing a new one. The new secret
   * will have a fresh expiration timestamp. This operation requires the
   * current secret for authentication.
   * @param clientId - The client identifier
   * @param currentSecret - The current client secret
   * @returns Promise resolving to updated client registration
   */
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

    const { client_secret, client_secret_expires_at } = this.generateClientSecretMetadata();

    const updatedClient: ClientRegistration = {
      ...client,
      client_secret,
      client_secret_expires_at,
    };

    await this.storage.saveClient(updatedClient);

    return { success: true, client: updatedClient };
  }

  /**
   * Revokes an access token or refresh token (RFC 7009).
   *
   * Removes the token from storage after verifying it belongs to the specified client.
   * According to RFC 7009, revoking a non-existent token returns success to prevent
   * token scanning attacks.
   * @param token - The access token or refresh token to revoke
   * @param clientId - The client identifier that owns the token
   * @returns Promise resolving to success status
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
   * Returns OAuth 2.0 authorization server metadata (RFC 8414).
   *
   * Provides discovery information about the server's capabilities, endpoints,
   * and supported features. Typically exposed at /.well-known/oauth-authorization-server.
   * @returns Server metadata object containing issuer, endpoints, and supported features
   */
  public getMetadata() {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: `${this.config.baseUrl}/authorize`,
      token_endpoint: `${this.config.baseUrl}/token`,
      revocation_endpoint: `${this.config.baseUrl}/revoke`,
      scopes_supported: this.config.supportedScopes,
      response_types_supported: [ResponseTypes.CODE],
      grant_types_supported: [GrantTypes.AUTHORIZATION_CODE, GrantTypes.REFRESH_TOKEN],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      code_challenge_methods_supported: ['plain', 'S256'],
    };
  }

  /**
   * Removes expired tokens and authorization codes from storage.
   *
   * Should be called periodically to prevent storage bloat.
   * Delegates to the storage layer's cleanupExpiredTokens implementation.
   */
  public async cleanup(): Promise<void> {
    await this.storage.cleanupExpiredTokens();
  }
}
