/**
 * OAuth utility functions for token generation, validation, and PKCE
 */

import { randomBytes, createHash } from 'node:crypto';
import type {
  OAuthError,
  AuthorizationRequest,
  TokenRequest,
  ClientRegistration,
} from '../../types/oauth-provider.js';
import {
  OAuthErrorCodes,
  CodeChallengeMethods,
} from '../../types/oauth-provider.js';

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Generate authorization code
 */
export function generateAuthorizationCode(): string {
  return generateSecureToken(32);
}

/**
 * Generate access token
 */
export function generateAccessToken(): string {
  return generateSecureToken(32);
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(): string {
  return generateSecureToken(32);
}

/**
 * Generate client ID
 */
export function generateClientId(): string {
  return generateSecureToken(16);
}

/**
 * Generate client secret
 */
export function generateClientSecret(): string {
  return generateSecureToken(32);
}

/**
 * Validate authorization request parameters
 */
export function validateAuthorizationRequest(
  params: Partial<AuthorizationRequest>,
): { valid: boolean; error?: OAuthError } {
  // Check required parameters
  if (!params.response_type) {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Missing required parameter: response_type',
      },
    };
  }

  if (!params.client_id) {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Missing required parameter: client_id',
      },
    };
  }

  if (!params.redirect_uri) {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Missing required parameter: redirect_uri',
      },
    };
  }

  // Validate response_type
  if (params.response_type !== 'code') {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE,
        error_description: 'Only authorization code flow is supported',
      },
    };
  }

  // Validate redirect_uri format
  try {
    new URL(params.redirect_uri);
  } catch {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Invalid redirect_uri format',
      },
    };
  }

  // Validate PKCE parameters if present
  if (params.code_challenge) {
    if (!params.code_challenge_method) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description:
            'code_challenge_method is required when code_challenge is present',
        },
      };
    }

    if (
      params.code_challenge_method !== CodeChallengeMethods.PLAIN &&
      params.code_challenge_method !== CodeChallengeMethods.S256
    ) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'Invalid code_challenge_method',
        },
      };
    }
  }

  return { valid: true };
}

/**
 * Validate token request parameters
 */
export function validateTokenRequest(params: Partial<TokenRequest>): {
  valid: boolean;
  error?: OAuthError;
} {
  // Check required parameters
  if (!params.grant_type) {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Missing required parameter: grant_type',
      },
    };
  }

  if (!params.client_id) {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Missing required parameter: client_id',
      },
    };
  }

  // Validate based on grant type
  if (params.grant_type === 'authorization_code') {
    if (!params.code) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'Missing required parameter: code',
        },
      };
    }

    if (!params.redirect_uri) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'Missing required parameter: redirect_uri',
        },
      };
    }
  } else if (params.grant_type === 'refresh_token') {
    if (!params.refresh_token) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'Missing required parameter: refresh_token',
        },
      };
    }
  } else {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.UNSUPPORTED_GRANT_TYPE,
        error_description: `Unsupported grant type: ${params.grant_type}`,
      },
    };
  }

  return { valid: true };
}

/**
 * Validate client credentials
 */
export function validateClientCredentials(
  client: ClientRegistration,
  clientSecret?: string,
): boolean {
  // Public clients don't have secrets
  if (!client.client_secret) {
    return !clientSecret;
  }

  if (
    typeof client.client_secret_expires_at === 'number' &&
    client.client_secret_expires_at > 0 &&
    isExpired(client.client_secret_expires_at)
  ) {
    return false;
  }

  // Confidential clients must provide correct secret
  return client.client_secret === clientSecret;
}

/**
 * Validate redirect URI against registered URIs
 */
export function validateRedirectUri(
  client: ClientRegistration,
  redirectUri: string,
): boolean {
  return client.redirect_uris.includes(redirectUri);
}

/**
 * Validate PKCE code verifier against challenge
 */
export function validatePkceChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): boolean {
  if (method === CodeChallengeMethods.PLAIN) {
    return codeVerifier === codeChallenge;
  }

  if (method === CodeChallengeMethods.S256) {
    const hash = createHash('sha256').update(codeVerifier).digest('base64url');
    return hash === codeChallenge;
  }

  return false;
}

/**
 * Parse space-separated scope string into array
 */
export function parseScopes(scope?: string): string[] {
  if (!scope) return [];
  return scope.split(' ').filter(Boolean);
}

/**
 * Convert scope array to space-separated string
 */
export function formatScopes(scopes: string[]): string {
  return scopes.join(' ');
}

/**
 * Check if requested scopes are valid
 */
export function validateScopes(
  requestedScopes: string[],
  supportedScopes: string[],
): boolean {
  return requestedScopes.every((scope) => supportedScopes.includes(scope));
}

/**
 * Get current timestamp in seconds
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Check if a timestamp is expired
 */
export function isExpired(expiresAt: number): boolean {
  return getCurrentTimestamp() >= expiresAt;
}

/**
 * Create OAuth error response with proper headers
 */
export function createOAuthErrorResponse(
  error: OAuthError,
  statusCode: number = 400,
) {
  return {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
    body: error,
  };
}

/**
 * Create successful token response with proper headers
 */
export function createTokenResponse(tokenData: Record<string, unknown>) {
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
    body: tokenData,
  };
}
