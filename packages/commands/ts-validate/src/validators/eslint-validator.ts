import * as fs from 'fs/promises';
import type { ESLint, Linter } from 'eslint';
import type { ValidationResult } from '../validator.js';
import type { ValidatorContext } from '../util/validator-context.js';

/**
 * Enriches ESLint messages with additional AI guidance for specific rules.
 *
 * @param message - The ESLint lint message to enrich
 */
function enrichMessage(message: Linter.LintMessage): void {
  const ruleId = message.ruleId as string;
  if (ruleId === '@typescript-eslint/no-unused-vars') {
    message.message +=
      ' Analyze if the variable will be used in future iterations of the current task - if so, add a TODO comment and use _ prefix. If not, remove the variable.';
  } else if (ruleId === '@typescript-eslint/no-explicit-any') {
    message.message +=
      ' Do not use: any, double casts like `as unknown as OtherType`. Make sure to lookup the correct type. If necessary, you can usually use Partial<>.';
  }
}

/**
 * Converts an ESLint message to a ValidationResult.
 *
 * @param message - The ESLint lint message to convert
 * @param autoFix - Whether auto-fixing is enabled
 * @returns The validation result
 */
function createValidationResult(
  message: Linter.LintMessage,
  autoFix: boolean | undefined,
): ValidationResult {
  return {
    tool: 'eslint',
    message: message.message,
    severity: message.severity === 2 ? 'error' : 'warning',
    line: message.line,
    column: message.column,
    endLine: message.endLine ?? undefined,
    endColumn: message.endColumn ?? undefined,
    ruleId: message.ruleId ?? undefined,
    fixable: Boolean(message.fix),
    fixedAutomatically: autoFix && Boolean(message.fix),
  };
}

/**
 * Processes a single ESLint result and adds validation results to context.
 *
 * @param result - The ESLint lint result to process
 * @param ctx - The validator context for storing results
 * @param autoFix - Whether auto-fixing is enabled
 */
async function processResult(
  result: ESLint.LintResult,
  ctx: ValidatorContext,
  autoFix: boolean | undefined,
): Promise<void> {
  const file = result.filePath;

  if (autoFix && result.output) {
    await fs.writeFile(file, result.output);
  }

  for (const message of result.messages) {
    enrichMessage(message);
    const validationResult = createValidationResult(message, autoFix);

    if (!validationResult.fixedAutomatically || !validationResult.fixable) {
      ctx.addResult(file, validationResult);
    }
  }

  addFixInfoIfNeeded(result, ctx, file, autoFix);
}

/**
 * Adds information about successful auto-fixes to the context.
 *
 * @param result - The ESLint lint result
 * @param ctx - The validator context for storing results
 * @param file - The file path that was linted
 * @param autoFix - Whether auto-fixing is enabled
 */
function addFixInfoIfNeeded(
  result: ESLint.LintResult,
  ctx: ValidatorContext,
  file: string,
  autoFix: boolean | undefined,
): void {
  if (!autoFix || !result.output) {
    return;
  }

  const fixCount = result.fixableErrorCount + result.fixableWarningCount;
  if (fixCount > 0) {
    ctx.addResult(file, {
      tool: 'eslint',
      message: `Fixed ${fixCount} issue(s)`,
      severity: 'info',
      fixedAutomatically: true,
    });
  }
}

/**
 * Validates files with ESLint.
 *
 * Runs ESLint on the provided files, optionally auto-fixing issues and
 * writing fixed content back to disk. Handles ESLint's ignore patterns
 * and enriches specific rule messages for AI guidance.
 *
 * @param files - Absolute file paths to validate
 * @param ESLintCtor - ESLint constructor from loaded module
 * @param ctx - Validator context for storing results
 * @param autoFix - Whether to auto-fix linting issues
 * @returns Promise that resolves when validation is complete
 *
 * @public
 */
export async function validateESLint(
  files: string[],
  ESLintCtor: typeof import('eslint').ESLint,
  ctx: ValidatorContext,
  autoFix?: boolean,
): Promise<void> {
  const eslint = new ESLintCtor({
    cache: true,
    fix: autoFix,
  });

  const lintableFiles = await Promise.all(
    files.map(async (file) => {
      const isIgnored = await eslint.isPathIgnored(file);
      return isIgnored ? null : file;
    }),
  );

  const filesToLint = lintableFiles.filter(Boolean) as string[];

  if (filesToLint.length === 0) {
    return;
  }

  const results = await eslint.lintFiles(filesToLint);

  for (const result of results) {
    await processResult(result, ctx, autoFix);
  }
}
