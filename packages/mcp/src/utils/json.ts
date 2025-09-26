/**
 * JSON serialization utilities using safe-stable-stringify
 */

import stringify from 'safe-stable-stringify';

/**
 * Safely stringify a value to JSON with stable key ordering
 * Handles circular references, BigInts, and other edge cases
 * @param value
 */
export function safeStringify(value: unknown): string {
  return stringify(value) || '{}';
}

/**
 * Safely stringify with custom indentation
 * @param value
 * @param indent
 */
export function safeStringifyPretty(value: unknown, indent = 2): string {
  return stringify(value, null, indent) || '{}';
}

/**
 * Convert a value to a JSON-compatible format with warnings
 * This maintains compatibility with the previous toJsonValue behavior
 * @param value
 * @param warnings
 * @param path
 */
export function toJsonValue(value: unknown, warnings?: string[], path?: string): unknown {
  // Handle primitive types
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  // Handle dates
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle undefined
  if (typeof value === 'undefined') {
    return undefined;
  }

  // For complex types, try to serialize and warn if there are issues
  try {
    // Parse the stringified version to ensure it's valid JSON
    const stringified = stringify(value);
    return JSON.parse(stringified);
  } catch (_error) {
    if (warnings && path) {
      warnings.push(`Skipped unsupported value at ${path} (type: ${typeof value})`);
    }
    return undefined;
  }
}
