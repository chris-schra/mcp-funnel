/**
 * Authorization validation for OAuth provider
 * Handles PKCE, scopes, redirect URI, and consent validation
 */

import type {
  IUserConsentService,
  OAuthProviderConfig,
  AuthorizationRequest,
  AuthorizationCode,
  ClientRegistration,
  OAuthError,
} from '../../types/oauth-provider.js';

import { OAuthErrorCodes } from '../../types/oauth-provider.js';

import {
  validateRedirectUri,
  parseScopes,
  validateScopes,
  generateAuthorizationCode,
  getCurrentTimestamp,
} from '../utils/oauth-utils.js';

export interface AuthorizationValidationResult {
  valid: boolean;
  authorizationCode?: string;
  redirectUri?: string;
  state?: string;
  error?: OAuthError;
}

export interface ConsentCheckResult {
  hasConsent: boolean;
  consentUri?: string;
  error?: OAuthError;
}

/**
 * Validates authorization requests and manages consent flow
 */
export class AuthorizationValidator {
  constructor(
    private consentService: IUserConsentService,
    private config: OAuthProviderConfig,
  ) {}

  /**
   * Validate complete authorization request
   */
  async validateAuthorizationRequest(
    params: AuthorizationRequest,
    client: ClientRegistration,
    userId: string,
  ): Promise<AuthorizationValidationResult> {
    const { redirect_uri, scope, state, code_challenge } = params;

    // Validate redirect URI
    const redirectValidation = this.validateRedirectUri(client, redirect_uri);
    if (!redirectValidation.valid) {
      return redirectValidation;
    }

    // Parse and validate scopes
    const scopeValidation = this.validateRequestedScopes(scope);
    if (!scopeValidation.valid) {
      return scopeValidation;
    }

    // Check PKCE requirements for public clients
    const pkceValidation = this.validatePkceRequirements(
      client,
      code_challenge,
    );
    if (!pkceValidation.valid) {
      return pkceValidation;
    }

    // Check user consent
    const requestedScopes = parseScopes(scope);
    const consentCheck = await this.checkUserConsent(
      userId,
      params.client_id,
      requestedScopes,
      params,
    );
    if (!consentCheck.hasConsent) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.CONSENT_REQUIRED,
          error_description:
            'User consent is required for the requested scopes',
          consent_uri: consentCheck.consentUri,
        },
      };
    }

    // Generate authorization code
    const code = generateAuthorizationCode();

    return {
      valid: true,
      authorizationCode: code,
      redirectUri: redirect_uri,
      state,
    };
  }

  /**
   * Create authorization code record
   */
  createAuthorizationCode(
    params: AuthorizationRequest,
    userId: string,
    code: string,
  ): AuthorizationCode {
    const {
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = params;

    const requestedScopes = parseScopes(scope);

    return {
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
  }

  /**
   * Validate redirect URI against client registration
   */
  private validateRedirectUri(
    client: ClientRegistration,
    redirectUri: string,
  ): AuthorizationValidationResult {
    if (!validateRedirectUri(client, redirectUri)) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'Invalid redirect_uri',
        },
      };
    }

    return { valid: true };
  }

  /**
   * Validate requested scopes
   */
  private validateRequestedScopes(
    scope?: string,
  ): AuthorizationValidationResult {
    const requestedScopes = parseScopes(scope);
    if (!validateScopes(requestedScopes, this.config.supportedScopes)) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_SCOPE,
          error_description: 'Invalid scope',
        },
      };
    }

    return { valid: true };
  }

  /**
   * Validate PKCE requirements for public clients
   */
  private validatePkceRequirements(
    client: ClientRegistration,
    codeChallenge?: string,
  ): AuthorizationValidationResult {
    // Check PKCE requirements for public clients
    if (!client.client_secret && this.config.requirePkce && !codeChallenge) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'PKCE is required for public clients',
        },
      };
    }

    return { valid: true };
  }

  /**
   * Check user consent for requested scopes
   */
  private async checkUserConsent(
    userId: string,
    clientId: string,
    requestedScopes: string[],
    params: AuthorizationRequest,
  ): Promise<ConsentCheckResult> {
    const hasConsent = await this.consentService.hasUserConsented(
      userId,
      clientId,
      requestedScopes,
    );

    if (!hasConsent) {
      const consentUri = this.buildConsentUri(params);
      return { hasConsent: false, consentUri };
    }

    return { hasConsent: true };
  }

  /**
   * Build consent URI for redirecting user to consent flow
   */
  private buildConsentUri(params: AuthorizationRequest): string {
    const {
      client_id,
      scope,
      state,
      redirect_uri,
      code_challenge,
      code_challenge_method,
    } = params;

    const consentParams = new URLSearchParams({ client_id });

    if (scope) {
      consentParams.set('scope', scope);
    }
    if (state) {
      consentParams.set('state', state);
    }
    if (redirect_uri) {
      consentParams.set('redirect_uri', redirect_uri);
    }
    if (code_challenge) {
      consentParams.set('code_challenge', code_challenge);
    }
    if (code_challenge_method) {
      consentParams.set('code_challenge_method', code_challenge_method);
    }

    return `/api/oauth/consent?${consentParams.toString()}`;
  }

  /**
   * Validate scope downscaling for refresh token requests
   */
  validateScopeDownscaling(
    requestedScopes: string[],
    originalScopes: string[],
  ): { valid: boolean; error?: OAuthError } {
    // Requested scopes must be a subset of original scopes
    if (!requestedScopes.every((s) => originalScopes.includes(s))) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_SCOPE,
          error_description: 'Requested scope exceeds original grant',
        },
      };
    }

    return { valid: true };
  }
}
