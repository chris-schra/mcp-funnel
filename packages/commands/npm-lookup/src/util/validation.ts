/**
 * Parameter validation functions for MCP tool calls
 */
import { MAX_SEARCH_RESULTS } from '../types.js';

/**
 * Validate packageName parameter from MCP tool args
 */
export function validatePackageNameParameter(
  packageName: unknown,
): { valid: false; error: string } | { valid: true; value: string } {
  if (typeof packageName !== 'string') {
    return {
      valid: false,
      error: 'Error: packageName parameter must be a string',
    };
  }
  return { valid: true, value: packageName };
}

/**
 * Validate query parameter from MCP tool args
 */
export function validateQueryParameter(
  query: unknown,
): { valid: false; error: string } | { valid: true; value: string } {
  if (typeof query !== 'string') {
    return { valid: false, error: 'Error: query parameter must be a string' };
  }
  return { valid: true, value: query };
}

/**
 * Validate limit parameter from MCP tool args
 */
export function validateLimitParameter(
  limit: unknown,
):
  | { valid: false; error: string }
  | { valid: true; value: number | undefined } {
  if (limit === undefined) {
    return { valid: true, value: undefined };
  }

  if (typeof limit !== 'number' || limit < 1 || limit > MAX_SEARCH_RESULTS) {
    return {
      valid: false,
      error: `Error: limit must be a number between 1 and ${MAX_SEARCH_RESULTS}`,
    };
  }

  return { valid: true, value: limit };
}
