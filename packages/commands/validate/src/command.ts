import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import { MonorepoValidator, ValidateOptions } from './validator.js';
import chalk from 'chalk';
import path from 'path';

export class TsValidateCommand implements ICommand {
  readonly name = 'ts-validate';
  readonly description = 'Run prettier, eslint, and TypeScript validation';

  async executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult> {
    const validator = new MonorepoValidator();
    const options: ValidateOptions = {
      files: args.files as string[] | undefined,
      glob: args.glob as string | undefined,
      fix: Boolean(args.fix),
      cache: args.cache !== false,
    };

    const result = await validator.validate(options);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  async executeViaCLI(args: string[]): Promise<void> {
    // Parse CLI args similar to original validate.ts
    const flags: string[] = [];
    const positional: string[] = [];

    for (const arg of args) {
      if (arg.startsWith('--')) {
        flags.push(arg);
      } else if (!arg.startsWith('-')) {
        positional.push(arg);
      }
    }

    // Handle help flag
    if (flags.includes('--help')) {
      console.info(`
${chalk.bold('Usage:')} validate [options] [glob-pattern]

${chalk.bold('Options:')}
  --fix          Automatically fix fixable issues
  --json         Output results as JSON
  --cache        Use caching for faster subsequent runs (default: true)
  --no-cache     Disable caching
  --show-actions Show suggested actions for AI
  --help         Show this help message

${chalk.bold('Examples:')}
  validate                              # Validate all files
  validate --fix                        # Validate and auto-fix issues
  validate --json "src/**/*.ts"         # Validate src TypeScript files, output JSON
  validate --fix --json "packages/bus/**/*"  # Fix and validate bus package
  validate file1.ts file2.ts file3.ts   # Validate specific files
`);
      process.exit(0);
    }

    // Use all positional arguments as files if multiple are provided,
    // otherwise treat single argument as a glob pattern
    const hasMultipleFiles = positional.length > 1;
    const files = hasMultipleFiles ? positional : undefined;
    const globPattern =
      !hasMultipleFiles && positional.length === 1 ? positional[0] : undefined;

    const options: ValidateOptions = {
      files: files,
      glob: globPattern,
      fix: flags.includes('--fix'),
      cache: !flags.includes('--no-cache'),
    };

    try {
      const validator = new MonorepoValidator();
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
            chalk.yellow(
              `  Auto-fixable files: ${summary.fixableFiles.length}`,
            ),
          );
        }

        if (summary.unfixableFiles.length > 0) {
          console.error(
            chalk.red(
              `  Manual fixes needed: ${summary.unfixableFiles.length}`,
            ),
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

  getMCPDefinition(): Tool {
    return {
      name: this.name,
      description: this.description,
      inputSchema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific files to validate',
          },
          glob: {
            type: 'string',
            description: 'Glob pattern to match files',
          },
          fix: {
            type: 'boolean',
            description: 'Automatically fix fixable issues',
          },
          cache: {
            type: 'boolean',
            description:
              'Use caching for faster subsequent runs (default: true)',
          },
        },
      },
    };
  }
}
