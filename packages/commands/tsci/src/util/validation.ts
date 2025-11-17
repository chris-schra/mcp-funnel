/**
 * Parameter validation utilities for TSCI MCP tool calls.
 *
 * Provides type-safe validation for MCP tool parameters with discriminated
 * union return types, allowing callers to narrow types based on validation result.
 * @internal
 */

import type { VerbosityLevel } from '../formatters/types.js';

/**
 * Validates file path parameter is a non-empty string.
 * @param path - Untyped parameter from MCP tool arguments
 * @returns Discriminated union: success with typed value or error with message
 * @public
 * @see file:../../command.ts - Used in describe_file tool execution
 */
export function validateFilePath(
  path: unknown,
): { valid: false; error: string } | { valid: true; value: string } {
  if (typeof path !== 'string') {
    return {
      valid: false,
      error: 'Error: file parameter must be a string',
    };
  }

  if (path.trim().length === 0) {
    return {
      valid: false,
      error: 'Error: file parameter cannot be empty',
    };
  }

  return { valid: true, value: path };
}

/**
 * Validates symbol ID parameter is a non-empty string.
 * @param id - Untyped parameter from MCP tool arguments
 * @returns Discriminated union: success with typed value or error with message
 * @public
 * @see file:../../command.ts - Used in describe_symbol tool execution
 */
export function validateSymbolId(
  id: unknown,
): { valid: false; error: string } | { valid: true; value: string } {
  if (typeof id !== 'string') {
    return {
      valid: false,
      error: 'Error: symbolId parameter must be a string',
    };
  }

  if (id.trim().length === 0) {
    return {
      valid: false,
      error: 'Error: symbolId parameter cannot be empty',
    };
  }

  return { valid: true, value: id };
}

/**
 * Validates verbosity level parameter.
 *
 * Accepts undefined (defaults to 'minimal') or one of the allowed verbosity levels.
 * Returns a discriminated union to enable type narrowing.
 * @param level - Untyped parameter from MCP tool arguments
 * @returns Discriminated union: success with typed value or error with message
 * @public
 * @see file:../../command.ts - Used in tool execution
 */
export function validateVerbosity(
  level: unknown,
): { valid: false; error: string } | { valid: true; value: VerbosityLevel | undefined } {
  if (level === undefined) {
    return { valid: true, value: undefined };
  }

  if (typeof level !== 'string') {
    return {
      valid: false,
      error: 'Error: verbosity parameter must be a string',
    };
  }

  const validLevels: VerbosityLevel[] = ['minimal', 'normal', 'detailed'];
  if (!validLevels.includes(level as VerbosityLevel)) {
    return {
      valid: false,
      error: `Error: verbosity must be one of: ${validLevels.join(', ')}`,
    };
  }

  return { valid: true, value: level as VerbosityLevel };
}

/**
 * Validates files array parameter.
 *
 * Accepts an array of non-empty strings.
 * Returns a discriminated union to enable type narrowing.
 * @param files - Untyped parameter from MCP tool arguments
 * @returns Discriminated union: success with typed value or error with message
 * @public
 * @see file:../../command.ts - Used in understand_context tool execution
 */
export function validateFileArray(
  files: unknown,
): { valid: false; error: string } | { valid: true; value: string[] } {
  if (!Array.isArray(files)) {
    return {
      valid: false,
      error: 'Error: files parameter must be an array',
    };
  }

  if (files.length === 0) {
    return {
      valid: false,
      error: 'Error: files array cannot be empty',
    };
  }

  for (const file of files) {
    if (typeof file !== 'string') {
      return {
        valid: false,
        error: 'Error: all items in files array must be strings',
      };
    }

    if (file.trim().length === 0) {
      return {
        valid: false,
        error: 'Error: files array cannot contain empty strings',
      };
    }
  }

  return { valid: true, value: files as string[] };
}
