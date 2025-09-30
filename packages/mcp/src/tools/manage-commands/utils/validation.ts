/**
 * Validation utilities for manage-commands tool.
 *
 * Provides parameter validation functions for command management operations.
 * @internal
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Result of a validation operation.
 * @public
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Optional error result if validation failed */
  error?: CallToolResult;
}

/**
 * Validates that the package parameter is provided.
 * @param packageSpec - Package specification to validate
 * @returns Validation result with error if package is missing
 * @public
 */
export function validatePackageParam(packageSpec: unknown): ValidationResult {
  if (!packageSpec) {
    return {
      valid: false,
      error: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Missing required parameter: package',
            }),
          },
        ],
      },
    };
  }
  return { valid: true };
}
