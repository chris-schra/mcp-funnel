/**
 * BearerTokenAuthProvider - Static Bearer token authentication provider
 *
 * This provider uses a static Bearer token for authentication.
 * The token is provided during construction and used for all requests.
 */

import type { IAuthProvider } from '../interfaces/auth-provider.interface.js';
import {
  AuthenticationError,
  AuthErrorCode,
} from '../errors/authentication-error.js';
import { logEvent } from '../../logger.js';
import {
  EnvironmentResolver,
  resolveEnvironmentVariables,
} from './environment-resolver.js';

/**
 * Configuration interface for BearerTokenAuthProvider
 */
export interface BearerTokenConfig {
  /**
   * The Bearer token to use for authentication
   * Can include environment variable references like ${TOKEN_VAR}
   */
  token: string;
  /**
   * Optional environment object for resolving variables
   * If not provided, uses process.env
   */
  env?: Record<string, string | undefined>;
}

/**
 * Authentication provider that uses a static Bearer token.
 *
 * This provider:
 * - Uses a static Bearer token provided during construction
 * - Validates that the token is non-empty and properly formatted
 * - Is always considered valid once constructed with a valid token
 * - Never needs refreshing (static token)
 * - Logs provider creation for audit purposes
 * - Supports environment variable resolution in token value
 *
 * Use this provider when:
 * - You have a static API key or long-lived token
 * - The API uses simple Bearer token authentication
 * - Token rotation is handled externally
 *
 * Security considerations:
 * - Tokens are never logged or exposed in error messages
 * - Environment variable resolution allows secure token storage
 * - Token validation prevents empty/malformed tokens
 */
export class BearerTokenAuthProvider implements IAuthProvider {
  private readonly token: string;

  constructor(config: BearerTokenConfig) {
    // Resolve environment variables in token
    let resolvedToken: string;
    try {
      resolvedToken = EnvironmentResolver.containsVariables(config.token)
        ? resolveEnvironmentVariables(config.token, { envSource: config.env })
        : config.token;
    } catch (error) {
      throw new AuthenticationError(
        error instanceof Error
          ? error.message
          : 'Environment variable resolution failed',
        AuthErrorCode.INVALID_TOKEN,
      );
    }

    // Validate token format and presence
    this.validateToken(resolvedToken);

    // Store the resolved token (never log it)
    this.token = resolvedToken;

    // Log provider creation for audit/debugging purposes
    // Note: Never log the actual token for security
    logEvent('info', 'auth:provider_created', {
      type: 'BearerTokenAuthProvider',
      tokenLength: this.token.length,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Returns headers with Bearer token authorization
   * @returns Promise resolving to headers with Authorization field
   */
  async getHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  /**
   * Always returns true since static tokens are always valid once validated
   * @returns Promise resolving to true
   */
  async isValid(): Promise<boolean> {
    // Static token is always valid (validation happens during construction)
    return true;
  }

  /**
   * No-op refresh method since static tokens don't need refreshing
   * This method is optional but provided for completeness
   */
  async refresh?(): Promise<void> {
    // No-op: static tokens don't need refreshing
    logEvent('debug', 'auth:refresh_attempted', {
      type: 'BearerTokenAuthProvider',
      action: 'noop',
      reason: 'static_token',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Validates that the token is properly formatted and not empty
   * @param token - The token to validate
   * @throws AuthenticationError if token is invalid
   */
  private validateToken(token: string): void {
    // Check if token is empty or only whitespace
    if (!token || token.trim().length === 0) {
      throw AuthenticationError.missingToken();
    }

    // Check for obviously malformed tokens (too short, suspicious patterns)
    const trimmedToken = token.trim();
    if (trimmedToken.length < 1) {
      throw new AuthenticationError(
        'Bearer token appears to be malformed or empty',
        AuthErrorCode.INVALID_TOKEN,
      );
    }

    // Additional validation could be added here based on expected token format
    // For example, checking for minimum length, character patterns, etc.
    // But we keep it minimal to support various token formats
  }
}
