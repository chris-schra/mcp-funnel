import { coerceToString } from '../../provider/utils/coerceToString.js';

/**
 * Parse space-separated scope string into array
 */
export function parseScopes(scope?: string): string[] {
  if (!scope) return [];
  return scope.split(' ').filter(Boolean);
}

/**
 * Normalize scope input from various formats to string array
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
