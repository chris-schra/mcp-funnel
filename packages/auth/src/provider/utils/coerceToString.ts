/**
 * Coerces unknown values to strings with type-aware conversion logic.
 *
 * Handles multiple input types gracefully: strings pass through unchanged,
 * finite numbers convert via toString(), booleans become 'true'/'false',
 * and arrays return the first successfully coerced element.
 *
 * Commonly used for extracting string values from untyped request bodies
 * or normalizing inputs before further parsing.
 * @param value - The value to coerce. Accepts strings (returned as-is),
 *   finite numbers (converted to string), booleans (to 'true'/'false'),
 *   or arrays (returns first coercible element). Returns undefined for
 *   null, undefined, objects, Infinity, NaN, or empty arrays.
 * @returns The coerced string value, or undefined if coercion is not possible
 * @example
 * ```typescript
 * coerceToString('hello')           // => 'hello'
 * coerceToString(42)                // => '42'
 * coerceToString(true)              // => 'true'
 * coerceToString([null, 123, 'x'])  // => '123' (first coercible)
 * coerceToString({})                // => undefined
 * coerceToString(null)              // => undefined
 * ```
 * @public
 */
export function coerceToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const coerced = coerceToString(entry);
      if (coerced) {
        return coerced;
      }
    }
  }

  return undefined;
}
