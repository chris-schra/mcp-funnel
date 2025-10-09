/**
 * JSON serialization utilities using safe-stable-stringify
 */

import stringify from 'safe-stable-stringify';

/**
 * Safely stringify a value to JSON with stable key ordering
 * Handles circular references, BigInts, and other edge cases
 * @param value - The value to stringify
 * @returns JSON string representation of the value
 */
export function safeStringify(value: unknown): string {
  const result = stringify(value);
  return result !== undefined ? result : '{}';
}

/**
 * Safely stringify with custom indentation
 * @param value - The value to stringify
 * @param indent - Number of spaces for indentation (default: 2)
 * @returns Pretty-printed JSON string representation of the value
 */
export function safeStringifyPretty(value: unknown, indent = 2): string {
  const result = stringify(value, null, indent);
  return result !== undefined ? result : '{}';
}

/**
 * Convert a value to a JSON-compatible format with warnings
 * This maintains compatibility with the previous toJsonValue behavior
 * @param value - The value to convert to JSON-compatible format
 * @param warnings - Optional array to collect warning messages about unconvertible values
 * @param path - Optional path string for error reporting context
 * @returns JSON-compatible representation of the value, or undefined if conversion fails
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
