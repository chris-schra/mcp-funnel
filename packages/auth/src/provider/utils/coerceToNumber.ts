import { coerceToString } from './coerceToString.js';

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
