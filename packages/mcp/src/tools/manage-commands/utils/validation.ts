/**
 * Validation utilities for manage-commands tool
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ValidationResult {
  valid: boolean;
  error?: CallToolResult;
}

/**
 * Validate that the package parameter is provided
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
