/**
 * Validates that a value is a non-empty string
 * @param value - Value to validate
 * @param label - Field name for error messages
 * @returns Validated string
 * @throws Error if value is invalid
 */
export function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

/**
 * Validates optional string value
 * @param value - Value to validate
 * @param label - Field name for error messages
 * @returns Validated string or undefined
 * @throws Error if value is not a string
 */
export function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

/**
 * Validates that a value is a number
 * @param value - Value to validate
 * @param label - Field name for error messages
 * @returns Validated number
 * @throws Error if value is invalid
 */
export function expectNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }
  return value;
}

/**
 * Validates optional boolean value
 * @param value - Value to validate
 * @param label - Field name for error messages
 * @returns Validated boolean or undefined
 * @throws Error if value is not a boolean
 */
export function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

/**
 * Validates that a value is a boolean
 * @param value - Value to validate
 * @param label - Field name for error messages
 * @returns Validated boolean
 * @throws Error if value is invalid
 */
export function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

/**
 * Validates that a value is a record/object
 * @param value - Value to validate
 * @param label - Field name for error messages
 * @returns Validated record
 * @throws Error if value is invalid
 */
export function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Validates optional string array
 * @param value - Value to validate
 * @param label - Field name for error messages
 * @returns Validated string array or undefined
 * @throws Error if value is invalid
 */
export function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${label}[${index}] must be a string.`);
    }
    return entry;
  });
}

/**
 * Validates optional string record
 * @param value - Value to validate
 * @param label - Field name for error messages
 * @returns Validated string record or undefined
 * @throws Error if value is invalid
 */
export function optionalStringRecord(
  value: unknown,
  label: string,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = expectRecord(value, label);
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(record)) {
    if (typeof val !== 'string') {
      throw new Error(`${label}.${key} must be a string.`);
    }
    result[key] = val;
  }
  return result;
}
