import { coerceToString } from '../../provider/utils/coerceToString.js';

/**
 * Parse boolean flag from various input formats
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
