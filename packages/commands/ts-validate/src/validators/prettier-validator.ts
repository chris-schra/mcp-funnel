import * as fs from 'fs/promises';
import type { ValidationResult } from '../validator.js';
import type { ValidatorContext } from '../util/validator-context.js';

/**
 * Validates files with Prettier.
 *
 * Checks files for formatting issues using Prettier, optionally auto-fixing
 * them. Respects .prettierignore and resolves project-specific config.
 *
 * @param files - Absolute file paths to validate
 * @param prettier - Prettier module instance from loaded module
 * @param ctx - Validator context for storing results
 * @param autoFix - Whether to auto-fix formatting issues
 * @returns Promise resolving to object with configFound flag
 *
 * @public
 */
export async function validatePrettier(
  files: string[],
  prettier: typeof import('prettier'),
  ctx: ValidatorContext,
  autoFix?: boolean,
): Promise<{ configFound: boolean }> {
  let configFound = false;
  for (const file of files) {
    // Use prettier's built-in getFileInfo to check if file should be ignored
    const fileInfo = await prettier.getFileInfo(file, {
      ignorePath: '.prettierignore',
    });

    // Skip if prettier says to ignore this file
    if (fileInfo.ignored) {
      continue;
    }

    try {
      const source = await fs.readFile(file, 'utf-8');
      const resolved = await prettier.resolveConfig(file);
      if (resolved) configFound = true;
      const options = resolved || {};

      const formatted = await prettier.format(source, {
        ...options,
        filepath: file,
      });

      const needsFormatting = source !== formatted;

      if (needsFormatting) {
        const result: ValidationResult = {
          tool: 'prettier',
          message: 'File needs formatting',
          severity: 'error',
          fixable: true,
          fixedAutomatically: false,
        };

        if (autoFix) {
          await fs.writeFile(file, formatted);
          result.fixedAutomatically = true;
          result.message = 'File was automatically formatted';
          result.severity = 'info';
        }

        ctx.addResult(file, result);
      }
    } catch (error) {
      ctx.addResult(file, {
        tool: 'prettier',
        message: `Prettier error: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        fixable: false,
      });
    }
  }
  return { configFound };
}
