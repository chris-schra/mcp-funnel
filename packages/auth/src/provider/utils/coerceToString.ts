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
