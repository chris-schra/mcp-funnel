/**
 * Parameter validation utilities for MCP tool calls.
 *
 * Provides type-safe validation for MCP tool parameters with discriminated
 * union return types, allowing callers to narrow types based on validation result.
 * @internal
 */
import { MAX_SEARCH_RESULTS } from '../types.js';

/**
 * Validates packageName parameter is a string.
 * @param packageName - Untyped parameter from MCP tool arguments
 * @returns Discriminated union: success with typed value or error with message
 * @public
 * @see file:../../command.ts:93 - Used in lookup tool execution
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
 * Validates query parameter is a string.
 * @param query - Untyped parameter from MCP tool arguments
 * @returns Discriminated union: success with typed value or error with message
 * @public
 * @see file:../../command.ts:111 - Used in search tool execution
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
 * Validates limit parameter is a valid number within allowed range.
 *
 * Accepts undefined (no limit specified) or a number between 1 and MAX_SEARCH_RESULTS.
 * Returns a discriminated union to enable type narrowing.
 * @param limit - Untyped parameter from MCP tool arguments
 * @returns Discriminated union: success with typed value/undefined or error with message
 * @public
 * @see file:../../command.ts:116 - Used in search tool execution
 */
export function validateLimitParameter(
  limit: unknown,
): { valid: false; error: string } | { valid: true; value: number | undefined } {
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
