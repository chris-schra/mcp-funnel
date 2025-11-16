import { coerceToString } from '../../provider/utils/coerceToString.js';

/**
 * Parses space-separated scope string into array of individual scope values.
 *
 * Splits on spaces and filters out empty strings, handling cases where
 * multiple consecutive spaces exist in the input.
 * @param scope - Space-separated scope string (e.g., 'read write admin').
 *   Returns empty array if undefined, null, or empty string.
 * @returns Array of individual scope strings with empty values removed
 * @example
 * ```typescript
 * parseScopes('read write admin')    // => ['read', 'write', 'admin']
 * parseScopes('read  write   admin') // => ['read', 'write', 'admin']
 * parseScopes('')                    // => []
 * parseScopes(undefined)             // => []
 * ```
 * @public
 * @see file:./scope.utils.ts:8 - Re-exported by ScopeUtils
 */
export function parseScopes(scope?: string): string[] {
  if (!scope) return [];
  return scope.split(' ').filter(Boolean);
}

/**
 * Normalizes scope input from various formats to a consistent string array.
 *
 * Accepts strings, numbers, booleans, or arrays containing these types, and
 * converts them to an array of scope strings. Each value is coerced to a string
 * (via {@link coerceToString}), then parsed as space-separated scopes. This allows
 * flexible input handling for OAuth scope parameters from different sources.
 * @param value - Scope input in any format: string ('read write'), number (42),
 *   boolean (true), or array containing any of these types. Arrays are flattened
 *   and each element processed. Null, undefined, objects, and other non-coercible
 *   values are ignored.
 * @returns Array of individual scope strings. Returns empty array if input cannot
 *   be coerced to any valid scope values.
 * @example
 * ```typescript
 * // String input with space-separated scopes
 * normalizeScopeInput('read write admin')      // => ['read', 'write', 'admin']
 *
 * // Array of strings (each can have multiple scopes)
 * normalizeScopeInput(['read write', 'admin']) // => ['read', 'write', 'admin']
 *
 * // Mixed array with coercible types
 * normalizeScopeInput([42, true, 'read'])      // => ['42', 'true', 'read']
 *
 * // Non-coercible values return empty array
 * normalizeScopeInput(null)                    // => []
 * normalizeScopeInput({})                      // => []
 * normalizeScopeInput([null, undefined])       // => []
 * ```
 * @public
 * @see file:../../provider/utils/coerceToString.ts - Type coercion logic
 * @see file:./scope.utils.ts:9 - Re-exported by ScopeUtils
 */
export function normalizeScopeInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    const scoped: string[] = [];
    for (const entry of value) {
      const converted = coerceToString(entry);
      if (converted) {
        scoped.push(...parseScopes(converted));
      }
    }
    return scoped;
  }

  const single = coerceToString(value);
  return single ? parseScopes(single) : [];
}
