import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import {
  FileValidationResults,
  MonorepoValidator,
  ValidateOptions,
  ValidationResult,
  ValidationSummary,
  ToolRunStatus,
} from './validator.js';
import path from 'path';
import chalk from 'chalk';

interface ParsedCliArgs {
  flags: {
    fix: boolean;
    json: boolean;
    cache: boolean;
    showActions: boolean;
    help: boolean;
  };
  files?: string[];
  globPattern?: string;
}

/*
import { setupConsoleLogging, rootLogger } from '@mcp-funnel/core';

// Setup console logging with redaction
setupConsoleLogging();
// Set log level from environment or default to info
rootLogger.level = process.env.LOG_LEVEL || 'info';*/

export class TsValidateCommand implements ICommand {
  public readonly name = 'ts-validate';
  public readonly description =
    'Run prettier, eslint, and TypeScript validation';

  public async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    // For single-tool commands, delegate to the original implementation
    return this.executeViaMCP(args);
  }

  public async executeViaMCP(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const validator = new MonorepoValidator();
    const mcpFiles = ((): string[] | undefined => {
      if (Array.isArray(args.files)) return args.files as string[];
      if (Array.isArray(args.paths)) return args.paths as string[];
      if (typeof args.dir === 'string') return [String(args.dir)];
      return undefined;
    })();
    const options: ValidateOptions = {
      files: mcpFiles,
      glob: args.glob as string | undefined,
      // MCP: `autoFix` (default true). Back-compat: if `fix` provided, use it when autoFix is undefined.
      fix:
        args.autoFix === undefined
          ? args.fix === undefined
            ? true
            : Boolean(args.fix)
          : Boolean(args.autoFix),
      cache: args.cache === true, // Default to false for safety
      tsConfigFile:
        typeof args.tsConfigFile === 'string'
          ? String(args.tsConfigFile)
          : undefined,
    };
    const compact = args.compact === undefined ? true : Boolean(args.compact);
    const result = await validator.validate(options);

    // Compact fileResults by default: include only files with results
    let out: ValidationSummary & { processedFiles?: string[] } =
      result as ValidationSummary & { processedFiles?: string[] };
    if (compact) {
      const compacted: FileValidationResults = {};
      for (const [file, list] of Object.entries(result.fileResults)) {
        if (list.length > 0) compacted[file] = list;
      }
      out = { ...result, fileResults: compacted };
      if (out.processedFiles) delete out.processedFiles;
    } else {
      // Expand to include clean files with empty arrays
      const expanded: FileValidationResults = { ...result.fileResults };
      const allFiles: string[] =
        (result as ValidationSummary & { processedFiles?: string[] })
          .processedFiles || [];
      for (const f of allFiles) {
        if (!Object.prototype.hasOwnProperty.call(expanded, f)) {
          expanded[f] = [];
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

  private parseCliArgs(args: string[]): ParsedCliArgs {
    const flags: string[] = [];
    const positional: string[] = [];

    for (const arg of args) {
      if (arg.startsWith('--')) {
        flags.push(arg);
      } else if (!arg.startsWith('-')) {
        positional.push(arg);
      }
    }

    const hasMultipleFiles = positional.length > 1;
    const files = hasMultipleFiles ? positional : undefined;
    const globPattern =
      !hasMultipleFiles && positional.length === 1 ? positional[0] : undefined;

    return {
      flags: {
        fix: flags.includes('--fix'),
        json: flags.includes('--json'),
        cache: flags.includes('--cache'),
        showActions: flags.includes('--show-actions'),
        help: flags.includes('--help'),
      },
      files,
      globPattern,
    };
  }

  private showHelp(): never {
    console.info(`
${chalk.bold('Usage:')} validate [options] [glob-pattern]

${chalk.bold('Options:')}
  --fix          Automatically fix fixable issues
  --json         Output results as JSON
  --cache        Enable ESLint caching for faster subsequent runs (default: false)
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

  private formatToolStatus(toolStatuses: ToolRunStatus[] | undefined): string {
    const failed = toolStatuses?.filter((s) => s.status === 'failed') || [];
    const skipped = toolStatuses?.filter((s) => s.status === 'skipped') || [];

    if (failed.length === 0 && skipped.length === 0) {
      return '';
    }

    const lines: string[] = [chalk.blue.bold('\n🛠 Tool Status:')];
    for (const s of [...failed, ...skipped]) {
      const label =
        s.status === 'failed' ? chalk.red('failed') : chalk.yellow('skipped');
      const reason = s.reason ? ` (${s.reason})` : '';
      const err = s.error ? `: ${s.error}` : '';
      lines.push(`  - ${s.tool}: ${label}${reason}${err}`);
    }
    return lines.join('\n');
  }

  private formatFileResults(file: string, results: ValidationResult[]): string {
    const lines: string[] = [];
    const relativePath = process.env.VALIDATE_FULL_FILE_PATH
      ? `file:///${file}`
      : path.relative(process.cwd(), file);
    lines.push(chalk.yellow(`\n${relativePath}:`));

    for (const result of results) {
      const icon =
        result.severity === 'error'
          ? '❌'
          : result.severity === 'warning'
            ? '⚠️'
            : 'ℹ️';
      const location = result.line ? `:${result.line}:${result.column}` : '';
      const ruleInfo = result.ruleId ? ` (${result.ruleId})` : '';

      lines.push(
        `  ${icon} [${result.tool}${location}] ${result.message}${ruleInfo}`,
      );

      if (result.fixable && !result.fixedAutomatically) {
        lines.push(
          chalk.green(
            `     💡 Fixable: ${result.suggestedFix || 'auto-fix available'}`,
          ),
        );
      }
    }
    return lines.join('\n');
  }

  private formatSummary(
    summary: ValidationSummary,
    showActions: boolean,
  ): string {
    const lines: string[] = [
      chalk.blue.bold('\n📊 Summary:'),
      `  Total files checked: ${summary.totalFiles}`,
      `  Files with issues: ${summary.filesWithErrors}`,
    ];

    if (summary.fixableFiles.length > 0) {
      lines.push(
        chalk.yellow(`  Auto-fixable files: ${summary.fixableFiles.length}`),
      );
    }

    if (summary.unfixableFiles.length > 0) {
      lines.push(
        chalk.red(`  Manual fixes needed: ${summary.unfixableFiles.length}`),
      );
    }

    if (showActions && summary.suggestedActions.length > 0) {
      lines.push(chalk.blue.bold('\n🤖 Suggested Actions:'));
      for (const action of summary.suggestedActions) {
        const relativePath = path.relative(process.cwd(), action.file);
        lines.push(`  • ${relativePath}: ${action.description}`);
      }
    }

    return lines.join('\n');
  }

  private formatNoIssuesOutput(
    summary: ValidationSummary,
    isEmpty: boolean,
  ): string {
    const message = isEmpty
      ? chalk.green('✨ No issues found')
      : chalk.green('✅ All files passed validation!');

    const toolStatus = this.formatToolStatus(summary.toolStatuses);
    return toolStatus ? `${message}${toolStatus}` : message;
  }

  private formatIssuesOutput(
    summary: ValidationSummary,
    showActions: boolean,
  ): string {
    const lines: string[] = [chalk.blue.bold('\nValidation Results:\n')];

    for (const [file, results] of Object.entries(summary.fileResults)) {
      if (results.length > 0) {
        lines.push(this.formatFileResults(file, results));
      }
    }

    lines.push(this.formatSummary(summary, showActions));
    return lines.join('\n');
  }

  public async executeViaCLI(args: string[]): Promise<void> {
    const parsed = this.parseCliArgs(args);

    if (parsed.flags.help) {
      this.showHelp();
    }

    const options: ValidateOptions = {
      files: parsed.files,
      glob: parsed.globPattern,
      fix: parsed.flags.fix,
      cache: parsed.flags.cache,
    };

    try {
      const validator = new MonorepoValidator();
      const summary = await validator.validate(options);

      if (parsed.flags.json) {
        console.info(JSON.stringify(summary, null, 2));
        return;
      }

      const isEmpty = Object.keys(summary.fileResults).length === 0;
      const hasIssues = Object.values(summary.fileResults).some(
        (r) => r.length > 0,
      );
      const anyFailed = summary.toolStatuses?.some(
        (s) => s.status === 'failed',
      );

      if (isEmpty || !hasIssues) {
        const output = this.formatNoIssuesOutput(summary, isEmpty);
        console.info(output);
        const exitCode = anyFailed ? 2 : 0;
        process.exit(exitCode);
      }

      const output = this.formatIssuesOutput(summary, parsed.flags.showActions);
      console.info(output);

      const exitCode = summary.filesWithErrors > 0 ? 1 : anyFailed ? 2 : 0;
      process.exit(exitCode);
    } catch (error: Error | unknown) {
      console.error(
        chalk.red('Validation failed:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  public getMCPDefinitions(): Tool[] {
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
            paths: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Alternate to files; accepts directories or files (directories will be expanded)',
            },
            dir: {
              type: 'string',
              description:
                'Single directory to validate (equivalent to passing it in files)',
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
            tsConfigFile: {
              type: 'string',
              description:
                'Explicit tsconfig.json path to use for TypeScript validation (overrides discovery)',
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
