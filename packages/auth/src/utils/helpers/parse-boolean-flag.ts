import { coerceToString } from '../../provider/utils/coerceToString.js';

/**
 * Parses boolean flags from various input formats commonly found in form data.
 *
 * Accepts unknown input types (strings, booleans, numbers, arrays) and coerces
 * them to boolean values. Recognizes common truthy string representations like
 * 'true', '1', 'yes', and 'on' (case-insensitive).
 * @param value - The value to parse. Can be a boolean (returned as-is),
 *   string (parsed for truthy values), number, array, or any other type.
 *   Coerced to string via {@link coerceToString} before parsing.
 * @returns `true` if the value is boolean true or matches 'true', '1', 'yes',
 *   or 'on' (case-insensitive). Returns `false` for all other inputs including
 *   null, undefined, empty strings, and unrecognized values.
 * @example
 * ```typescript
 * parseBooleanFlag(true)              // => true
 * parseBooleanFlag('true')            // => true
 * parseBooleanFlag('TRUE')            // => true
 * parseBooleanFlag('1')               // => true
 * parseBooleanFlag('yes')             // => true
 * parseBooleanFlag('on')              // => true
 * parseBooleanFlag(false)             // => false
 * parseBooleanFlag('false')           // => false
 * parseBooleanFlag('0')               // => false
 * parseBooleanFlag('')                // => false
 * parseBooleanFlag(null)              // => false
 * parseBooleanFlag(['true'])          // => true (first element)
 * ```
 * @public
 * @see file:../../provider/utils/coerceToString.ts - String coercion logic
 */
export function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = coerceToString(value);
  if (!normalized) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  return (
    lowered === 'true' ||
    lowered === '1' ||
    lowered === 'yes' ||
    lowered === 'on'
  );
}
