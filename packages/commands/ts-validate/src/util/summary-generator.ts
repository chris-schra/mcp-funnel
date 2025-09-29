import type {
  FileValidationResults,
  ValidationSummary,
  ToolRunStatus,
} from '../validator.js';

/**
 * Creates a validation summary from file results
 * @param fileResults - File validation results
 * @param toolStatuses - Tool execution statuses
 * @param totalFilesCount - Total number of files validated
 * @returns Validation summary
 */
export function createSummary(
  fileResults: FileValidationResults,
  toolStatuses: ToolRunStatus[],
  totalFilesCount: number,
): ValidationSummary {
  const filesWithErrors = Object.keys(fileResults).filter(
    (file) => fileResults[file].length > 0,
  );

  const fixableFiles = Object.keys(fileResults).filter((file) =>
    fileResults[file].some((r) => r.fixable && !r.fixedAutomatically),
  );

  const unfixableFiles = Object.keys(fileResults).filter((file) =>
    fileResults[file].some((r) => !r.fixable && r.severity === 'error'),
  );

  // Generate suggested actions for AI
  const suggestedActions = generateSuggestedActions(fileResults);

  return {
    fileResults,
    processedFiles: undefined, // set by caller if needed
    totalFiles: totalFilesCount,
    filesWithErrors: filesWithErrors.length,
    fixableFiles,
    unfixableFiles,
    suggestedActions,
    toolStatuses,
  };
}

/**
 * Generates suggested actions for AI based on validation results
 * @param fileResults - File validation results
 * @returns Suggested actions
 */
export function generateSuggestedActions(
  fileResults: FileValidationResults,
): ValidationSummary['suggestedActions'] {
  const actions: ValidationSummary['suggestedActions'] = [];

  for (const [file, results] of Object.entries(fileResults)) {
    const hasUnfixedPrettier = results.some(
      (r) => r.tool === 'prettier' && r.fixable && !r.fixedAutomatically,
    );
    const hasUnfixedEslint = results.some(
      (r) => r.tool === 'eslint' && r.fixable && !r.fixedAutomatically,
    );
    const hasTypeErrors = results.some(
      (r) => r.tool === 'typescript' && r.severity === 'error',
    );

    if (hasUnfixedPrettier) {
      actions?.push({
        file,
        action: 'prettier-fix',
        description: 'Run prettier --write on this file',
      });
    }

    if (hasUnfixedEslint) {
      actions?.push({
        file,
        action: 'eslint-fix',
        description: 'Run eslint --fix on this file',
      });
    }

    if (hasTypeErrors) {
      actions?.push({
        file,
        action: 'manual-fix',
        description: 'Manual TypeScript fixes required',
      });
    }
  }

  return actions;
}

/**
 * Gets actionable items for AI from validation results
 * @param fileResults - File validation results
 * @returns Actionable items
 */
export function getActionableItems(
  fileResults: FileValidationResults,
): Array<{ file: string; line?: number; fix: string }> {
  const items = [];

  for (const [file, results] of Object.entries(fileResults)) {
    for (const result of results) {
      if (result.severity === 'error' && !result.fixedAutomatically) {
        items?.push({
          file,
          line: result.line,
          fix: result.suggestedFix || result.message,
        });
      }
    }
  }

  return items;
}
