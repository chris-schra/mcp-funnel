/**
 * OAuth scope utilities
 */

import { parseScopes, normalizeScopeInput } from './normalize-scope-input.js';

export class ScopeUtils {
  public static parseScopes = parseScopes;
  public static normalizeScopeInput = normalizeScopeInput;

  /**
   * Convert scope array to space-separated string
   */
  public static formatScopes(scopes: string[]): string {
    return scopes.join(' ');
  }
}

// Re-export individual functions for direct import
export { parseScopes, normalizeScopeInput } from './normalize-scope-input.js';
