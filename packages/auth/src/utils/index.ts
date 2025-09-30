/**
 * Centralized OAuth utilities export module.
 *
 * Provides comprehensive OAuth 2.0 utilities organized by functional concern:
 * - Token generation, parsing, and validation
 * - Error handling and response formatting
 * - Request validation and PKCE support
 * - Scope parsing and normalization
 * - Helper functions for common operations
 *
 * @example Individual imports (preferred for tree-shaking)
 * ```typescript
 * import { TokenUtils } from './token/token.utils.js';
 * import { OAuthErrorUtils } from './error/oauth-error.utils.js';
 *
 * const token = TokenUtils.generateAccessToken();
 * const error = OAuthErrorUtils.createOAuth2Error('invalid_request');
 * ```
 *
 * @example Unified utilities class (backward compatibility)
 * ```typescript
 * import { OAuthUtils } from './index.js';
 *
 * const token = OAuthUtils.generateAccessToken();
 * const isValid = OAuthUtils.validateClientCredentials(clientId, clientSecret);
 * ```
 * @public
 * @see {@link OAuthUtils} - Combined utilities class
 * @see {@link TokenUtils} - Token operations
 * @see {@link OAuthErrorUtils} - Error handling
 * @see {@link OAuthValidationUtils} - Validation operations
 */

// Token utilities
export * from './token/token.utils.js';

// Error handling utilities
export * from './error/oauth-error.utils.js';

// Validation utilities
export * from './validation/validation.utils.js';

// Response utilities
export * from './response/oauth-response.utils.js';

// Scope utilities
export * from './scope/scope.utils.js';

// Helper utilities
export * from './helpers/helper.utils.js';

// Re-export existing OAuth types (keep compatibility)
export * from './oauth-types.js';

// PKCE utilities
export * from './pkce.js';

// Authorization flow utilities
export * from './auth-flow.js';

// Authorization URL utilities
export * from './auth-url.js';

// Token exchange utilities
export * from './token-exchange.js';

// Combined OAuth utilities class for convenience
import { TokenUtils } from './token/token.utils.js';
import { OAuthErrorUtils } from './error/oauth-error.utils.js';
import { OAuthValidationUtils } from './validation/validation.utils.js';
import { OAuthResponseUtils } from './response/oauth-response.utils.js';
import { ScopeUtils } from './scope/scope.utils.js';
import { HelperUtils } from './helpers/helper.utils.js';

/**
 * Combined OAuth utilities for backward compatibility
 * Prefer importing specific utility classes for better tree-shaking
 */
export const OAuthUtils = {
  // Token utilities
  generateSecureToken: TokenUtils.generateSecureToken,
  generateAuthorizationCode: TokenUtils.generateAuthorizationCode,
  generateAccessToken: TokenUtils.generateAccessToken,
  generateRefreshToken: TokenUtils.generateRefreshToken,
  generateClientId: TokenUtils.generateClientId,
  generateClientSecret: TokenUtils.generateClientSecret,
  parseTokenResponse: TokenUtils.parseTokenResponse,
  extractBearerToken: TokenUtils.extractBearerToken,
  getCurrentTimestamp: TokenUtils.getCurrentTimestamp,
  isExpired: TokenUtils.isExpired,

  // Validation utilities
  validateClientCredentials: OAuthValidationUtils.validateClientCredentials,
  validateRedirectUri: OAuthValidationUtils.validateRedirectUri,
  validatePkceChallenge: OAuthValidationUtils.validatePkceChallenge,
  validateScopes: OAuthValidationUtils.validateScopes,
  validateAuthorizationRequest:
    OAuthValidationUtils.validateAuthorizationRequest,
  validateTokenRequest: OAuthValidationUtils.validateTokenRequest,

  // Scope utilities
  parseScopes: ScopeUtils.parseScopes,
  formatScopes: ScopeUtils.formatScopes,
  normalizeScopeInput: ScopeUtils.normalizeScopeInput,

  // Response utilities
  createOAuthErrorResponse: OAuthResponseUtils.createOAuthErrorResponse,
  createTokenResponse: OAuthResponseUtils.createTokenResponse,

  // Helper utilities
  getCurrentUserId: HelperUtils.getCurrentUserId,
  prefersJsonResponse: HelperUtils.prefersJsonResponse,
  coerceToString: HelperUtils.coerceToString,
  parseBooleanFlag: HelperUtils.parseBooleanFlag,
  coerceToNumber: HelperUtils.coerceToNumber,

  // Error utilities
  parseErrorResponse: OAuthErrorUtils.parseErrorResponse,
  createOAuth2Error: OAuthErrorUtils.createOAuth2Error,
  isRetryableError: OAuthErrorUtils.isRetryableError,
};
