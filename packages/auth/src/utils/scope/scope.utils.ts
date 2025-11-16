/**
 * OAuth scope utilities for parsing, normalizing, and formatting OAuth scopes.
 *
 * Provides methods to convert between different scope representations:
 * - Parse space-separated strings into arrays
 * - Normalize unknown inputs into arrays
 * - Format arrays back to space-separated strings
 * @example
 * ```typescript
 * import { ScopeUtils } from './scope.utils.js';
 *
 * // Parse space-separated scopes
 * const scopes = ScopeUtils.parseScopes('read write admin');
 * // => ['read', 'write', 'admin']
 *
 * // Format back to string
 * const formatted = ScopeUtils.formatScopes(['read', 'write']);
 * // => 'read write'
 *
 * // Normalize various inputs
 * const normalized = ScopeUtils.normalizeScopeInput(['read', 'write admin']);
 * // => ['read', 'write', 'admin']
 * ```
 * @public
 * @see file:./normalize-scope-input.ts - Core parsing and normalization implementations
 */

import { parseScopes, normalizeScopeInput } from './normalize-scope-input.js';

export class ScopeUtils {
  public static parseScopes = parseScopes;
  public static normalizeScopeInput = normalizeScopeInput;

  /**
   * Converts an array of scope strings to a space-separated string for OAuth2 protocols.
   *
   * This is the inverse of {@link parseScopes} and is used when constructing OAuth2
   * token responses where the `scope` field must be a space-separated string per RFC 6749.
   * @param scopes - Array of scope strings to format
   * @returns Space-separated string of scopes
   * @example
   * ```typescript
   * const formatted = ScopeUtils.formatScopes(['read', 'write', 'admin']);
   * // => 'read write admin'
   * ```
   * @see file:../../provider/token-utils/handleAuthorizationCodeGrant.ts:167 - Usage in token response
   */
  public static formatScopes(scopes: string[]): string {
    return scopes.join(' ');
  }
}

// Re-export individual functions for direct import
export { parseScopes, normalizeScopeInput } from './normalize-scope-input.js';
