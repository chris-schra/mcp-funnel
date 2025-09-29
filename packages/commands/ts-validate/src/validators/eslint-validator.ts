import * as fs from 'fs/promises';
import type { ValidationResult } from '../validator.js';
import type { ValidatorContext } from '../util/validator-context.js';

/**
 * Validates files with ESLint
 * @param files - Files to validate
 * @param ESLintCtor - ESLint constructor
 * @param ctx - Validator context for storing results
 * @param autoFix - Whether to auto-fix linting issues
 */
export async function validateESLint(
  files: string[],
  ESLintCtor: typeof import('eslint').ESLint,
  ctx: ValidatorContext,
  autoFix?: boolean,
): Promise<void> {
  const eslint = new ESLintCtor({
    cache: true,
    fix: autoFix, // Enable auto-fixing if requested
  });

  // Filter out files that ESLint should ignore
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
    const file = result.filePath;

    // If auto-fix was applied, write the output
    if (autoFix && result.output) {
      await fs.writeFile(file, result.output);
    }

    for (const message of result.messages) {
      const ruleId = message.ruleId as string;
      if (ruleId === '@typescript-eslint/no-unused-vars') {
        message.message +=
          ' Analyze if the variable will be used in future iterations of the current task - if so, add a TODO comment and use _ prefix. If not, remove the variable.';
      } else if (ruleId === '@typescript-eslint/no-explicit-any') {
        message.message +=
          ' Do not use: any, double casts like `as unknown as OtherType`. Make sure to lookup the correct type. If necessary, you can usually use Partial<>.';
      }

      const validationResult: ValidationResult = {
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

      // Only add if not fixed or if it's unfixable
      if (!validationResult.fixedAutomatically || !validationResult.fixable) {
        ctx.addResult(file, validationResult);
      }
    }

    // Add info about successful fixes
    if (autoFix && result.output) {
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
  }
}
