import type { FileValidationResults } from '../validator.js';

/**
 * Context for validation operations that need to mutate file results.
 *
 * Provides a centralized place to manage validation results across different
 * validators (prettier, eslint, typescript), ensuring consistent result
 * structure and avoiding duplicate file entries.
 *
 * @example
 * ```typescript
 * const fileResults: FileValidationResults = {};
 * const ctx = new ValidatorContext(fileResults);
 * ctx.addResult('src/file.ts', {
 *   tool: 'prettier',
 *   message: 'File needs formatting',
 *   severity: 'warning'
 * });
 * ```
 *
 * @public
 * @see {@link validatePrettier|Prettier validator usage}
 * @see {@link validateESLint|ESLint validator usage}
 * @see {@link validateTypeScriptWithConfig|TypeScript validator usage}
 */
export class ValidatorContext {
  /**
   * Creates a new validator context.
   * @param fileResults - File validation results object to manage
   */
  public constructor(public readonly fileResults: FileValidationResults) {}

  /**
   * Ensures a file entry exists in the results map.
   *
   * Creates an empty array for the file if it doesn't exist, allowing
   * subsequent addResult calls to push validation results.
   *
   * @param file - Absolute path to the file
   */
  public ensureFileEntry(file: string): void {
    if (!this.fileResults[file]) {
      this.fileResults[file] = [];
    }
  }

  /**
   * Adds a validation result to a file's result array.
   *
   * Automatically ensures the file entry exists before adding the result.
   * Used by all validators to report findings (errors, warnings, info).
   *
   * @param file - Absolute path to the file
   * @param result - Validation result from prettier, eslint, or typescript
   */
  public addResult(file: string, result: FileValidationResults[string][number]): void {
    this.ensureFileEntry(file);
    this.fileResults[file]?.push(result);
  }
}
