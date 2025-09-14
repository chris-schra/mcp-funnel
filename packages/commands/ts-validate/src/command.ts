import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import { MonorepoValidator, ValidateOptions } from './validator.js';
import chalk from 'chalk';
import path from 'path';

export class TsValidateCommand implements ICommand {
  readonly name = 'ts-validate';
  readonly description = 'Run prettier, eslint, and TypeScript validation';

  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    // For single-tool commands, delegate to the original implementation
    return this.executeViaMCP(args);
  }

  async executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult> {
    const validator = new MonorepoValidator();
    const options: ValidateOptions = {
      files: args.files as string[] | undefined,
      glob: args.glob as string | undefined,
      // MCP: `autoFix` (default true). Back-compat: if `fix` provided, use it when autoFix is undefined.
      fix:
        args.autoFix === undefined
          ? args.fix === undefined
            ? true
            : Boolean(args.fix)
          : Boolean(args.autoFix),
      cache: args.cache !== false,
    };
    const compact = args.compact === undefined ? true : Boolean(args.compact);
    const result = await validator.validate(options);

    // Compact fileResults by default: include only files with results
    let out = result as any;
    if (compact) {
      const compacted: Record<string, unknown[]> = {};
      for (const [file, list] of Object.entries(result.fileResults)) {
        if (list.length > 0) compacted[file] = list;
      }
      out = { ...result, fileResults: compacted };
      if (out.processedFiles) delete out.processedFiles;
    } else {
      // Expand to include clean files with empty arrays
      const expanded: Record<string, unknown[]> = { ...result.fileResults };
      const allFiles: string[] = (result as any).processedFiles || [];
      for (const f of allFiles) {
        if (!Object.prototype.hasOwnProperty.call(expanded, f)) {
          expanded[f] = [] as unknown[];
        }
      }
      out = { ...result, fileResults: expanded };
      if (out.processedFiles) delete out.processedFiles;
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(out, null, 2),
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
          // Still report tool statuses if any were skipped/failed
          const failed =
            summary.toolStatuses?.filter((s) => s.status === 'failed') || [];
          const skipped =
            summary.toolStatuses?.filter((s) => s.status === 'skipped') || [];
          if (failed.length > 0 || skipped.length > 0) {
            console.info(chalk.blue.bold('\n🛠 Tool Status:'));
            for (const s of [...failed, ...skipped]) {
              const label =
                s.status === 'failed'
                  ? chalk.red('failed')
                  : chalk.yellow('skipped');
              const reason = s.reason ? ` (${s.reason})` : '';
              const err = s.error ? `: ${s.error}` : '';
              console.info(`  - ${s.tool}: ${label}${reason}${err}`);
            }
          }
          const exitCode = failed.length > 0 ? 2 : 0;
          process.exit(exitCode);
        }

        const hasIssues = Object.values(summary.fileResults).some(
          (r) => r.length > 0,
        );

        const anyFailed = summary.toolStatuses?.some(
          (s) => s.status === 'failed',
        );
        if (!hasIssues) {
          console.info(chalk.green('✅ All files passed validation!'));
          // Report tool statuses if any skipped/failed
          const failed =
            summary.toolStatuses?.filter((s) => s.status === 'failed') || [];
          const skipped =
            summary.toolStatuses?.filter((s) => s.status === 'skipped') || [];
          if (failed.length > 0 || skipped.length > 0) {
            console.info(chalk.blue.bold('\n🛠 Tool Status:'));
            for (const s of [...failed, ...skipped]) {
              const label =
                s.status === 'failed'
                  ? chalk.red('failed')
                  : chalk.yellow('skipped');
              const reason = s.reason ? ` (${s.reason})` : '';
              const err = s.error ? `: ${s.error}` : '';
              console.info(`  - ${s.tool}: ${label}${reason}${err}`);
            }
          }
          process.exit(anyFailed ? 2 : 0);
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
        process.exit(summary.filesWithErrors > 0 ? 1 : anyFailed ? 2 : 0);
      }
    } catch (error: Error | unknown) {
      console.error(
        chalk.red('Validation failed:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  getMCPDefinitions(): Tool[] {
    return [
      {
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
            autoFix: {
              type: 'boolean',
              description:
                'Enable auto-fix for Prettier and ESLint (default: true). Back-compat alias: fix',
            },
            cache: {
              type: 'boolean',
              description:
                'Use caching for faster subsequent runs (default: true)',
            },
            compact: {
              type: 'boolean',
              description:
                'When true (default), omit files with no results from fileResults',
            },
          },
        },
      },
    ];
  }
}
