import type { FileValidationResults } from '../validator.js';

/**
 * Context for validation operations that need to mutate file results
 */
export class ValidatorContext {
  public constructor(public readonly fileResults: FileValidationResults) {}

  /**
   * Ensures a file entry exists in the results
   */
  public ensureFileEntry(file: string): void {
    if (!this.fileResults[file]) {
      this.fileResults[file] = [];
    }
  }

  /**
   * Adds a validation result to a file
   */
  public addResult(
    file: string,
    result: FileValidationResults[string][number],
  ): void {
    this.ensureFileEntry(file);
    this.fileResults[file]?.push(result);
  }
}
