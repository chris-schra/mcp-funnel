import type {
  FileValidationResults,
  ValidationSummary,
  ToolRunStatus,
} from '../validator.js';

/**
 * Creates a validation summary from file results.
 *
 * Aggregates file-level validation results and tool statuses into a comprehensive
 * summary object, categorizing files by their fixability and generating suggested
 * actions for the AI agent.
 *
 * @param fileResults - File validation results keyed by file path
 * @param toolStatuses - Tool execution statuses (ok/skipped/failed)
 * @param totalFilesCount - Total number of files validated
 * @returns Validation summary with stats and suggested actions
 *
 * @public
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
 * Generates suggested actions for AI based on validation results.
 *
 * Analyzes validation results to determine which files need prettier/eslint
 * auto-fixing or manual TypeScript fixes, generating actionable recommendations.
 *
 * @param fileResults - File validation results keyed by file path
 * @returns Array of suggested actions with file paths and descriptions
 *
 * @public
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
 * Gets actionable items for AI from validation results.
 *
 * Extracts unfixed errors from validation results and formats them as actionable
 * items with file locations and suggested fixes for the AI agent to process.
 *
 * @param fileResults - File validation results keyed by file path
 * @returns Array of actionable items with file, line, and fix suggestion
 *
 * @public
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
