import { coerceToString } from './coerceToString.js';

/**
 * Coerces unknown values to finite numbers with type-aware conversion logic.
 *
 * Handles multiple input types gracefully: finite numbers pass through unchanged,
 * strings are parsed via Number(), and other types are first coerced to strings
 * using {@link coerceToString} before parsing.
 *
 * Commonly used for extracting numeric values from untyped request bodies
 * (e.g., ttl_seconds, timeout values) with robust handling of edge cases.
 * @param value - The value to coerce. Accepts finite numbers (returned as-is),
 *   strings that parse to finite numbers (e.g., '42', '3.14'), or any type
 *   coercible via {@link coerceToString} that parses to a finite number.
 *   Returns undefined for null, undefined, non-numeric strings, Infinity, NaN,
 *   or values that cannot be coerced to strings.
 * @returns The parsed finite number, or undefined if coercion is not possible
 * @example
 * ```typescript
 * coerceToNumber(42)                // => 42
 * coerceToNumber('123')             // => 123
 * coerceToNumber('3.14')            // => 3.14
 * coerceToNumber(true)              // => 1 (via coerceToString -> Number)
 * coerceToNumber([null, '456'])     // => 456 (first coercible via coerceToString)
 * coerceToNumber('not-a-number')    // => undefined
 * coerceToNumber(Infinity)          // => undefined
 * coerceToNumber(null)              // => undefined
 * ```
 * @see file:./coerceToString.ts - Related string coercion utility
 * @public
 */
export function coerceToNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const str = coerceToString(value);
  if (!str) {
    return undefined;
  }

  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}
