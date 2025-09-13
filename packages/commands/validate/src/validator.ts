#!/usr/bin/env tsx
import * as ts from 'typescript';
import * as prettier from 'prettier';
import { ESLint } from 'eslint';
import { globby } from 'globby';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

// Base validation result for each tool's finding
export interface ValidationResult {
  tool: 'prettier' | 'eslint' | 'typescript';
  message: string;
  severity: 'error' | 'warning' | 'info';
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;

  // Key addition: fixability information
  fixable?: boolean;
  fixedAutomatically?: boolean;
  suggestedFix?: string; // For TypeScript: might include suggested code
  ruleId?: string; // ESLint rule or TS error code
}

// File-centric results
export type FileValidationResults = Record<string, ValidationResult[]>;

export interface ValidateOptions {
  files?: string[]; // Specific files
  glob?: string; // Glob pattern
  fix?: boolean; // Auto-fix where possible
  cache?: boolean; // Use caching for speed
}

export interface ValidationSummary {
  // File-centric view for AI processing
  fileResults: FileValidationResults;

  // Summary stats
  totalFiles: number;
  filesWithErrors: number;
  fixableFiles: string[]; // Files that can be auto-fixed
  unfixableFiles: string[]; // Files needing manual intervention

  // Suggested actions for AI
  suggestedActions: Array<{
    file: string;
    action: 'prettier-fix' | 'eslint-fix' | 'manual-fix';
    description: string;
  }>;
}

export class MonorepoValidator {
  private fileResults: FileValidationResults = {};

  async validate(options: ValidateOptions = {}): Promise<ValidationSummary> {
    // Resolve files to validate
    const files = await this.resolveFiles(options);

    if (files.length === 0) {
      console.warn(chalk.yellow('No files found matching the pattern'));
      return this.createSummary();
    }

    // Initialize results structure
    files.forEach((file) => {
      this.fileResults[file] = [];
    });

    // Run all validators in parallel
    await Promise.all([
      this.validatePrettier(files, options.fix),
      this.validateESLint(files, options.fix),
      this.validateTypeScript(files),
    ]);

    return this.createSummary();
  }

  private async resolveFiles(options: ValidateOptions): Promise<string[]> {
    if (options.files) {
      // Process each provided path
      const patterns: string[] = [];

      for (const file of options.files) {
        const absolutePath = path.isAbsolute(file)
          ? file
          : path.resolve(process.cwd(), file);

        try {
          const stats = await fs.stat(absolutePath);

          if (stats.isDirectory()) {
            // Convert directory to glob pattern
            patterns.push(path.join(absolutePath, '**/*.{ts,tsx,js,jsx,json}'));
          } else {
            // Keep files as-is
            patterns.push(absolutePath);
          }
        } catch {
          // If stat fails, treat as a glob pattern or non-existent file
          // Let it be handled by globby or fail later in validation
          patterns.push(absolutePath);
        }
      }

      // Use globby to expand all patterns
      // Only ignore node_modules for performance - let each tool handle its own ignores
      return globby(patterns, {
        ignore: ['**/node_modules/**'],
        absolute: true,
      });
    }

    const pattern = options.glob || 'packages/**/*.{ts,tsx,js,jsx,json}';
    // Only ignore node_modules for performance - let each tool handle its own ignores
    return globby(pattern, {
      ignore: ['**/node_modules/**'],
      absolute: true,
    });
  }

  private async validatePrettier(files: string[], autoFix?: boolean) {
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
        const options = (await prettier.resolveConfig(file)) || {};

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

          // Ensure the file entry exists before pushing
          if (!this.fileResults[file]) {
            this.fileResults[file] = [];
          }
          this.fileResults[file]?.push(result);
        }
      } catch (error) {
        // Ensure the file entry exists before pushing
        if (!this.fileResults[file]) {
          this.fileResults[file] = [];
        }
        this.fileResults[file]?.push({
          tool: 'prettier',
          message: `Prettier error: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
          fixable: false,
        });
      }
    }
  }

  private async validateESLint(files: string[], autoFix?: boolean) {
    const eslint = new ESLint({
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
          this.fileResults[file]?.push(validationResult);
        }
      }

      // Add info about successful fixes
      if (autoFix && result.output) {
        const fixCount = result.fixableErrorCount + result.fixableWarningCount;
        if (fixCount > 0) {
          this.fileResults[file]?.push({
            tool: 'eslint',
            message: `Fixed ${fixCount} issue(s)`,
            severity: 'info',
            fixedAutomatically: true,
          });
        }
      }
    }
  }

  private async validateTypeScript(files: string[]) {
    // Find tsconfig
    const configPath = ts.findConfigFile(
      process.cwd(),
      ts.sys.fileExists,
      'tsconfig.json',
    );
    if (!configPath) {
      console.warn(
        chalk.yellow('No tsconfig.json found, skipping TypeScript validation'),
      );
      return;
    }

    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      path.dirname(configPath),
    );
    const {
      options,
      errors,
      fileNames: projectFileNames,
    } = parsed as unknown as {
      options: ts.CompilerOptions;
      errors: ts.Diagnostic[];
      fileNames: string[];
    };

    if (errors.length > 0) {
      console.error(chalk.red('Error parsing tsconfig.json:'));
      errors.forEach((error) => {
        console.error(`  ${error.messageText}`);
      });
      return;
    }

    // Always load full program (all TS files from the project),
    // but filter reported diagnostics to the requested files/glob if provided.
    const allTsProjectFiles = projectFileNames.filter(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
    );

    const program = ts.createProgram({
      rootNames: allTsProjectFiles,
      options: { ...options, noEmit: true },
    });

    // Get diagnostics for each file
    const sourceFiles = program
      .getSourceFiles()
      .filter((sf) => !sf.isDeclarationFile);

    // Determine scope filtering based on provided files/glob
    const tsFilesScope = new Set(
      files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx')),
    );
    const filterToScope = tsFilesScope.size > 0;

    for (const sourceFile of sourceFiles) {
      const diagnostics = [
        ...program.getSemanticDiagnostics(sourceFile),
        ...program.getSyntacticDiagnostics(sourceFile),
      ];

      // Skip diagnostics outside of the requested scope when a specific
      // files/glob argument was provided.
      if (filterToScope && !tsFilesScope.has(sourceFile.fileName)) {
        continue;
      }

      for (const diagnostic of diagnostics) {
        if (!diagnostic.file) continue;

        const file = diagnostic.file.fileName;
        const start = diagnostic.start || 0;
        const { line, character } = ts.getLineAndCharacterOfPosition(
          diagnostic.file,
          start,
        );

        const message = ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          '\n',
        );

        // Check if there's a suggested fix
        const suggestedFix = this.getTypeScriptFix(diagnostic);

        this.fileResults[file]?.push({
          tool: 'typescript',
          message,
          severity:
            diagnostic.category === ts.DiagnosticCategory.Error
              ? 'error'
              : 'warning',
          line: line + 1,
          column: character + 1,
          ruleId: `TS${diagnostic.code}`,
          fixable: Boolean(suggestedFix),
          suggestedFix,
        });
      }
    }
  }

  private getTypeScriptFix(diagnostic: ts.Diagnostic): string | undefined {
    // This could be expanded to detect common fixable patterns
    // For now, just identify some common cases
    const code = diagnostic.code;

    // Common auto-fixable TypeScript errors
    const fixableErrors: Record<number, string> = {
      2304: 'Add missing import',
      2339: 'Add property to type/interface',
      2345: 'Fix type mismatch',
      2551: 'Fix typo in property name',
      7006: 'Add type annotation',
      2741: 'Add missing properties',
      2322: 'Fix type assignment',
      2769: 'Fix overload signature',
    };

    return fixableErrors[code];
  }

  private createSummary(): ValidationSummary {
    const filesWithErrors = Object.keys(this.fileResults).filter(
      (file) => this.fileResults[file].length > 0,
    );

    const fixableFiles = Object.keys(this.fileResults).filter((file) =>
      this.fileResults[file].some((r) => r.fixable && !r.fixedAutomatically),
    );

    const unfixableFiles = Object.keys(this.fileResults).filter((file) =>
      this.fileResults[file].some((r) => !r.fixable && r.severity === 'error'),
    );

    // Generate suggested actions for AI
    const suggestedActions = this.generateSuggestedActions();

    return {
      fileResults: this.fileResults,
      totalFiles: Object.keys(this.fileResults).length,
      filesWithErrors: filesWithErrors.length,
      fixableFiles,
      unfixableFiles,
      suggestedActions,
    };
  }

  private generateSuggestedActions(): ValidationSummary['suggestedActions'] {
    const actions: ValidationSummary['suggestedActions'] = [];

    for (const [file, results] of Object.entries(this.fileResults)) {
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

  // Helper method for AI to get actionable items
  getActionableItems(): Array<{ file: string; line?: number; fix: string }> {
    const items = [];

    for (const [file, results] of Object.entries(this.fileResults)) {
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
}
