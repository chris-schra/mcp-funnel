#!/usr/bin/env tsx
import * as ts from 'typescript';
import * as prettier from 'prettier';
import { ESLint } from 'eslint';
import { globby } from 'globby';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

// Base validation result for each tool's finding
interface ValidationResult {
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
type FileValidationResults = Record<string, ValidationResult[]>;

interface ValidateOptions {
  files?: string[]; // Specific files
  glob?: string; // Glob pattern
  fix?: boolean; // Auto-fix where possible
  cache?: boolean; // Use caching for speed
}

interface ValidationSummary {
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

class MonorepoValidator {
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

  private findNearestTsConfig(filePath: string): string | null {
    let currentDir = path.dirname(filePath);
    const rootDir = path.parse(currentDir).root;

    while (currentDir !== rootDir) {
      const configPath = path.join(currentDir, 'tsconfig.json');
      if (ts.sys.fileExists(configPath)) {
        return configPath;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached root
      currentDir = parentDir;
    }

    return null;
  }

  private async validateTypeScript(files: string[]) {
    // Filter to only TypeScript files
    const tsFiles = files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

    // Group files by their nearest tsconfig.json
    const filesByConfig = new Map<string, string[]>();

    for (const file of tsFiles) {
      const configPath = this.findNearestTsConfig(file);
      if (!configPath) {
        console.warn(chalk.yellow(`No tsconfig.json found for ${file}, skipping`));
        continue;
      }

      if (!filesByConfig.has(configPath)) {
        filesByConfig.set(configPath, []);
      }
      filesByConfig.get(configPath)?.push(file);
    }

    // If no TypeScript files or no configs found, also check if we're in a monorepo
    // and should validate all packages
    if (filesByConfig.size === 0 && tsFiles.length === 0) {
      // Check for composite project at root
      const rootConfig = ts.findConfigFile(
        process.cwd(),
        ts.sys.fileExists,
        'tsconfig.json',
      );

      if (rootConfig) {
        const { config } = ts.readConfigFile(rootConfig, ts.sys.readFile);

        // If composite project, validate each referenced project
        if (config.references && config.references.length > 0) {
          for (const ref of config.references) {
            const refPath = path.resolve(path.dirname(rootConfig), ref.path, 'tsconfig.json');
            if (ts.sys.fileExists(refPath)) {
              const refConfig = ts.readConfigFile(refPath, ts.sys.readFile);
              const refParsed = ts.parseJsonConfigFileContent(
                refConfig.config,
                ts.sys,
                path.dirname(refPath),
              );

              const refTsFiles = refParsed.fileNames.filter(
                (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
              );

              if (refTsFiles.length > 0) {
                filesByConfig.set(refPath, refTsFiles);
              }
            }
          }
        } else {
          // Single project - get all its files
          const parsed = ts.parseJsonConfigFileContent(
            config,
            ts.sys,
            path.dirname(rootConfig),
          );

          const projectTsFiles = parsed.fileNames.filter(
            (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
          );

          if (projectTsFiles.length > 0) {
            filesByConfig.set(rootConfig, projectTsFiles);
          }
        }
      }
    }

    // Now validate each group of files with their appropriate tsconfig
    for (const [configPath, configFiles] of filesByConfig) {
      const { config } = ts.readConfigFile(configPath, ts.sys.readFile);

      // Parse the config to get all project files and options
      const parsed = ts.parseJsonConfigFileContent(
        config,
        ts.sys,
        path.dirname(configPath),
      );

      if (parsed.errors.length > 0) {
        console.error(chalk.red(`Error parsing ${configPath}:`));
        parsed.errors.forEach((error) => {
          const message = ts.flattenDiagnosticMessageText(error.messageText, '\n');
          console.error(`  ${message}`);
        });
        continue;
      }

      // Create program with all files from this config
      // This ensures proper module resolution within the package
      const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: { ...parsed.options, noEmit: true },
      });

      // Get diagnostics only for files in our validation scope
      const filesToValidate = new Set(configFiles);
      const sourceFiles = program
        .getSourceFiles()
        .filter((sf) => !sf.isDeclarationFile && filesToValidate.has(sf.fileName));

      for (const sourceFile of sourceFiles) {
        const diagnostics = [
          ...program.getSemanticDiagnostics(sourceFile),
          ...program.getSyntacticDiagnostics(sourceFile),
        ];

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

          const isError = diagnostic.category === ts.DiagnosticCategory.Error;

          this.fileResults[file]?.push({
            tool: 'typescript',
            message,
            severity: isError ? 'error' : 'warning',
            line: line + 1,
            column: character + 1,
            ruleId: `TS${diagnostic.code}`,
            fixable: Boolean(suggestedFix),
            suggestedFix,
          });
        }
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

// CLI execution
async function main() {
  const validator = new MonorepoValidator();

  // Parse CLI args - flags before positional args
  const args = process.argv.slice(2);

  // Separate flags from positional arguments
  const flags: string[] = [];
  const positional: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('--')) {
      flags.push(arg);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // Use all positional arguments as files if multiple are provided,
  // otherwise treat single argument as a glob pattern
  const hasMultipleFiles = positional.length > 1;
  const files = hasMultipleFiles ? positional : undefined;
  const globPattern =
    !hasMultipleFiles && positional.length === 1 ? positional[0] : undefined;

  // Handle help flag
  if (flags.includes('--help')) {
    console.info(`
${chalk.bold('Usage:')} tsx scripts/validate.ts [options] [glob-pattern]

${chalk.bold('Options:')}
  --fix          Automatically fix fixable issues
  --json         Output results as JSON
  --cache        Use caching for faster subsequent runs (default: true)
  --no-cache     Disable caching
  --show-actions Show suggested actions for AI
  --help         Show this help message

${chalk.bold('Examples:')}
  tsx scripts/validate.ts                              # Validate all files
  tsx scripts/validate.ts --fix                        # Validate and auto-fix issues
  tsx scripts/validate.ts --json "src/**/*.ts"         # Validate src TypeScript files, output JSON
  tsx scripts/validate.ts --fix --json "packages/bus/**/*"  # Fix and validate bus package
  tsx scripts/validate.ts file1.ts file2.ts file3.ts   # Validate specific files
`);
    process.exit(0);
  }

  const options: ValidateOptions = {
    files: files,
    glob: globPattern,
    fix: flags.includes('--fix'),
    cache: !flags.includes('--no-cache'),
  };

  try {
    const summary = await validator.validate(options);

    // Output for AI consumption (JSON) or human (formatted)
    if (flags.includes('--json')) {
      console.info(JSON.stringify(summary, null, 2));
    } else {
      // Human-readable output
      if (Object.keys(summary.fileResults).length === 0) {
        console.info(chalk.green('✨ No files to validate'));
        process.exit(0);
      }

      const hasIssues = Object.values(summary.fileResults).some(
        (r) => r.length > 0,
      );

      if (!hasIssues) {
        console.info(chalk.green('✅ All files passed validation!'));
        process.exit(0);
      }

      console.info(chalk.blue.bold('\nValidation Results:\n'));

      for (const [file, results] of Object.entries(summary.fileResults)) {
        if (results.length > 0) {
          const relativePath = path.relative(process.cwd(), file);
          console.error(chalk.yellow(`\n${relativePath}:`));

          for (const result of results) {
            const icon =
              result.severity === 'error'
                ? '❌'
                : result.severity === 'warning'
                  ? '⚠️'
                  : 'ℹ️';
            const location = result.line
              ? `:${result.line}:${result.column}`
              : '';
            const ruleInfo = result.ruleId ? ` (${result.ruleId})` : '';

            const logFn =
              result.severity === 'error'
                ? console.error
                : result.severity === 'warning'
                  ? console.warn
                  : console.info;
            logFn(
              `  ${icon} [${result.tool}${location}] ${result.message}${ruleInfo}`,
            );

            if (result.fixable && !result.fixedAutomatically) {
              console.info(
                chalk.green(
                  `     💡 Fixable: ${result.suggestedFix || 'auto-fix available'}`,
                ),
              );
            }
          }
        }
      }

      // Summary
      console.info(chalk.blue.bold('\n📊 Summary:'));
      console.info(`  Total files checked: ${summary.totalFiles}`);
      console.info(`  Files with issues: ${summary.filesWithErrors}`);

      if (summary.fixableFiles.length > 0) {
        console.warn(
          chalk.yellow(`  Auto-fixable files: ${summary.fixableFiles.length}`),
        );
      }

      if (summary.unfixableFiles.length > 0) {
        console.error(
          chalk.red(`  Manual fixes needed: ${summary.unfixableFiles.length}`),
        );
      }

      // Suggested actions for AI
      if (
        flags.includes('--show-actions') &&
        summary.suggestedActions.length > 0
      ) {
        console.info(chalk.blue.bold('\n🤖 Suggested Actions:'));
        for (const action of summary.suggestedActions) {
          const relativePath = path.relative(process.cwd(), action.file);
          console.info(`  • ${relativePath}: ${action.description}`);
        }
      }

      // Exit code
      process.exit(summary.filesWithErrors > 0 ? 1 : 0);
    }
  } catch (error: Error | unknown) {
    console.error(
      chalk.red('Validation failed:'),
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Check if this is the main module being run
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch(console.error);
}
export { MonorepoValidator };
export type { ValidationSummary, FileValidationResults, ValidationResult };
