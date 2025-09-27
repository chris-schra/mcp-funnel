/**
 * OAuth 2.0 Authorization Server implementation for mcp-funnel
 * Implements RFC 6749 OAuth 2.0 Authorization Framework
 *
 * Refactored to use modular architecture following SEAMS principle
 */

import type {
  IOAuthProviderStorage,
  IUserConsentService,
  OAuthProviderConfig,
  ClientRegistration,
  AuthorizationRequest,
  TokenRequest,
  TokenResponse,
  AccessToken,
  OAuthError,
} from '../types/oauth-provider.js';

import { ResponseTypes } from '../types/oauth-provider.js';

import {
  validateAuthorizationRequest,
  validateTokenRequest,
} from './utils/oauth-utils.js';

// Modular components
import { TokenManager } from './managers/token-manager.js';
import {
  ClientManager,
  type ClientRegistrationMetadata,
} from './managers/client-manager.js';
import { AuthorizationValidator } from './validators/authorization-validator.js';
import { GrantHandlerRegistry } from './handlers/grant-handlers.js';

export class OAuthProvider {
  private tokenManager: TokenManager;
  private clientManager: ClientManager;
  private authValidator: AuthorizationValidator;
  private grantHandlers: GrantHandlerRegistry;

  constructor(
    private storage: IOAuthProviderStorage,
    private consentService: IUserConsentService,
    private config: OAuthProviderConfig,
  ) {
    // Initialize modular components
    this.tokenManager = new TokenManager(storage, config);
    this.clientManager = new ClientManager(storage, config);
    this.authValidator = new AuthorizationValidator(consentService, config);
    this.grantHandlers = new GrantHandlerRegistry(
      storage,
      config,
      this.tokenManager,
    );
  }

  /**
   * Register a new OAuth client
   */
  async registerClient(
    metadata: ClientRegistrationMetadata,
  ): Promise<ClientRegistration> {
    return this.clientManager.registerClient(metadata);
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

    const request = params as AuthorizationRequest;

    // Get client information
    const clientValidation = await this.clientManager.validateClientExists(
      request.client_id,
    );
    if (!clientValidation.valid) {
      return { success: false, error: clientValidation.error };
    }

    const client = clientValidation.client!;

    // Use authorization validator for complete validation
    const authValidation =
      await this.authValidator.validateAuthorizationRequest(
        request,
        client,
        userId,
      );

    if (!authValidation.valid) {
      return {
        success: false,
        error: authValidation.error,
      };
    }

    // Create and save authorization code
    const authCode = this.authValidator.createAuthorizationCode(
      request,
      userId,
      authValidation.authorizationCode!,
    );

    await this.storage.saveAuthorizationCode(authCode);

    return {
      success: true,
      authorizationCode: authValidation.authorizationCode,
      redirectUri: authValidation.redirectUri,
      state: authValidation.state,
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

    // Delegate to grant handler registry
    return this.grantHandlers.handleTokenRequest(params as TokenRequest);
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<{
    valid: boolean;
    tokenData?: AccessToken;
    error?: string;
  }> {
    return this.tokenManager.validateAccessToken(token);
  }

  /**
   * Rotate client secret
   */
  async rotateClientSecret(
    clientId: string,
    currentSecret: string,
  ): Promise<{
    success: boolean;
    client?: ClientRegistration;
    error?: OAuthError;
  }> {
    return this.clientManager.rotateClientSecret(clientId, currentSecret);
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
    return this.tokenManager.revokeToken(token, clientId);
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
      grant_types_supported: this.grantHandlers.getSupportedGrantTypes(),
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

  // SEAM: Extension points for accessing modular components
  // These methods provide access to the underlying managers for advanced use cases

  /**
   * Get the token manager for advanced token operations
   */
  getTokenManager(): TokenManager {
    return this.tokenManager;
  }

  /**
   * Get the client manager for advanced client operations
   */
  getClientManager(): ClientManager {
    return this.clientManager;
  }

  /**
   * Get the authorization validator for custom validation logic
   */
  getAuthorizationValidator(): AuthorizationValidator {
    return this.authValidator;
  }

  /**
   * Get the grant handler registry for registering custom grant types
   */
  getGrantHandlerRegistry(): GrantHandlerRegistry {
    return this.grantHandlers;
  }
}
