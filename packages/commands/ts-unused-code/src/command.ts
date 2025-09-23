import { z } from 'zod';
import type { ICommand, CallToolResult } from '@mcp-funnel/commands-core';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TsrProcessor } from './processor.js';
import type {
  TsUnusedCodeOptions,
  CliOptions,
  ProcessedResult,
  TsUnusedCodeResult,
} from './types.js';
import chalk from 'chalk';
import path from 'path';

/**
 * Zod schema for validating MCP tool arguments
 */
const TsUnusedCodeArgsSchema = z.object({
  entrypoints: z.array(z.string()).optional(),
  tsConfigFile: z.string().optional(),
  autoFix: z.boolean().optional(),
  includeDts: z.boolean().optional(),
  recursive: z.boolean().optional(),
  projectRoot: z.string().optional(),
  verbose: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  workingDirectory: z.string().optional(),
  timeout: z.number().optional(),
});

/**
 * Command implementation for detecting unused exports and modules in TypeScript projects
 * Provides both MCP tool interface and CLI execution capabilities
 */
export class TsUnusedCodeCommand implements ICommand {
  readonly name = 'ts-unused-code';
  readonly description =
    'Detect unused exports and modules in TypeScript projects';

  private processor: TsrProcessor;

  constructor() {
    this.processor = new TsrProcessor();
  }

  /**
   * Get MCP tool definitions for this command
   * @returns Array containing the ts-unused-code tool definition
   */
  getMCPDefinitions(): Tool[] {
    return [
      {
        name: this.name,
        description: this.description,
        inputSchema: {
          type: 'object',
          properties: {
            entrypoints: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Entry point patterns (regex) to define code boundaries',
            },
            tsConfigFile: {
              type: 'string',
              description:
                'Path to tsconfig.json file (defaults to auto-discovery)',
            },
            autoFix: {
              type: 'boolean',
              description:
                'Enable automatic fixing by removing unused exports/files',
            },
            includeDts: {
              type: 'boolean',
              description: 'Include .d.ts files in analysis',
            },
            recursive: {
              type: 'boolean',
              description: 'Enable recursive analysis of dependencies',
            },
            projectRoot: {
              type: 'string',
              description:
                'Project root directory (defaults to current working directory)',
            },
            verbose: {
              type: 'boolean',
              description: 'Enable verbose/debug output',
            },
            dryRun: {
              type: 'boolean',
              description:
                'Run in dry-run mode (show what would be done without executing)',
            },
            workingDirectory: {
              type: 'string',
              description: 'Working directory for command execution',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds for command execution',
            },
          },
        },
      },
    ];
  }

  /**
   * Execute command via MCP protocol
   * @param toolName - Name of the tool to execute
   * @param args - Tool arguments as key-value pairs
   * @returns Tool execution result with analysis findings
   */
  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      // Validate tool name
      if (toolName !== this.name) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Unknown tool: ${toolName}. Expected: ${this.name}`,
            },
          ],
          isError: true,
        };
      }

      // Validate and parse arguments using zod schema
      const parseResult = TsUnusedCodeArgsSchema.safeParse(args);
      if (!parseResult.success) {
        const errorMessages = parseResult.error.issues
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid arguments: ${errorMessages}`,
            },
          ],
          isError: true,
        };
      }

      // Convert validated args to TsUnusedCodeOptions
      const options: TsUnusedCodeOptions = parseResult.data;

      // Execute analysis using processor
      const result = await this.processor.analyze(options);

      // Format results for AI/MCP consumption
      const formattedResult = this.formatForAI(result, options);

      return {
        content: [
          {
            type: 'text',
            text: formattedResult,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error during analysis: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Execute command via CLI interface
   * @param args - Command line arguments as string array
   */
  async executeViaCLI(args: string[]): Promise<void> {
    try {
      // Parse CLI arguments
      const options = this.parseCliArgs(args);

      // Handle help flag
      if (options.help) {
        this.showHelp();
        process.exit(0);
      }

      // Execute analysis
      const result = await this.processor.analyze(options);

      // Format and output results
      const output = this.formatForCLI(result, options);

      if (options.json) {
        console.info(output);
      } else {
        // Use appropriate log function for formatted output
        console.info(output);
      }

      // Exit with appropriate code based on findings
      const hasErrors = result.raw.errors.length > 0;
      const hasUnused =
        result.raw.unusedExports.length > 0 ||
        result.raw.unusedFiles.length > 0;

      if (hasErrors) {
        process.exit(2); // Analysis errors
      } else if (hasUnused && !options.autoFix) {
        process.exit(1); // Found unused code but not auto-fixing
      } else {
        process.exit(0); // Success or auto-fixed
      }
    } catch (error) {
      console.error(
        chalk.red('Analysis failed:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  /**
   * Format analysis results for AI/MCP consumption
   * @param result - Processed analysis result
   * @param options - Original analysis options
   * @returns Formatted string for AI consumption
   */
  private formatForAI(
    result: ProcessedResult,
    _options: TsUnusedCodeOptions,
  ): string {
    const tsUnusedResult: TsUnusedCodeResult = {
      status:
        result.raw.errors.length > 0
          ? 'error'
          : result.raw.unusedExports.length > 0 ||
              result.raw.unusedFiles.length > 0
            ? 'warning'
            : 'success',
      summary: this.generateSummary(result),
      result,
      executionContext: {
        executionTime: result.raw.duration,
      },
    };

    // Add warning about false positives prominently
    const falsePositiveWarning = `
⚠️  **IMPORTANT**: This analysis may include false positives. Unused code detection can be complex, especially with:
- Dynamic imports
- Runtime-only usage (e.g., types used only in JSDoc)
- Framework-specific patterns
- Barrel exports and re-exports
- Test files and mock dependencies

Please review findings carefully before removing code automatically.
`;

    const output = [
      falsePositiveWarning,
      '',
      '# TypeScript Unused Code Analysis',
      '',
      `**Status**: ${tsUnusedResult.status.toUpperCase()}`,
      `**Summary**: ${tsUnusedResult.summary}`,
      '',
      '## Analysis Results',
      '',
      JSON.stringify(tsUnusedResult, null, 2),
    ];

    // Add suggestions if available
    if (result.suggestions.length > 0) {
      output.push('', '## Suggestions', '');
      result.suggestions.forEach((suggestion, index) => {
        output.push(
          `${index + 1}. **${suggestion.type}** (${suggestion.confidence} confidence)`,
        );
        output.push(`   File: ${suggestion.file}`);
        output.push(`   ${suggestion.description}`);
        output.push('');
      });
    }

    return output.join('\n');
  }

  /**
   * Format analysis results for CLI output
   * @param result - Processed analysis result
   * @param options - CLI options including formatting preferences
   * @returns Formatted string for CLI output
   */
  private formatForCLI(result: ProcessedResult, options: CliOptions): string {
    if (options.json) {
      return JSON.stringify(result, null, 2);
    }

    const output: string[] = [];

    // Header with false positive warning
    output.push(
      chalk.yellow.bold(
        '\n⚠️  IMPORTANT: Review findings carefully - may include false positives!\n',
      ),
    );

    // Summary
    const summary = this.generateSummary(result);
    output.push(chalk.blue.bold('🔍 TypeScript Unused Code Analysis'));
    output.push(chalk.blue.bold('═'.repeat(40)));
    output.push(`📊 ${summary}\n`);

    // Unused exports
    if (result.raw.unusedExports.length > 0) {
      output.push(chalk.red.bold('📤 Unused Exports:'));
      result.raw.unusedExports.forEach((exp) => {
        const relativePath = path.relative(process.cwd(), exp.file);
        const location = `${relativePath}:${exp.line}:${exp.column}`;
        const fixableIcon = exp.fixable ? '🔧' : '❌';
        output.push(
          `  ${fixableIcon} ${chalk.yellow(exp.name)} (${exp.kind}) - ${location}`,
        );
        if (options.verbose) {
          output.push(`     Code: ${chalk.gray(exp.code.trim())}`);
        }
      });
      output.push('');
    }

    // Unused files
    if (result.raw.unusedFiles.length > 0) {
      output.push(chalk.red.bold('📁 Unused Files:'));
      result.raw.unusedFiles.forEach((file) => {
        const relativePath = path.relative(process.cwd(), file.file);
        const deletableIcon = file.deletable ? '🗑️' : '❌';
        output.push(`  ${deletableIcon} ${relativePath} (${file.reason})`);
      });
      output.push('');
    }

    // Errors
    if (result.raw.errors.length > 0) {
      output.push(chalk.red.bold('❌ Analysis Errors:'));
      result.raw.errors.forEach((error) => {
        const relativePath = path.relative(process.cwd(), error.file);
        output.push(`  • ${relativePath}: ${error.message}`);
        if (error.code && options.verbose) {
          output.push(`    Code: ${error.code}`);
        }
      });
      output.push('');
    }

    // Statistics
    output.push(chalk.blue.bold('📈 Statistics:'));
    output.push(`  Total files analyzed: ${result.raw.totalFiles}`);
    output.push(`  Unused exports found: ${result.raw.unusedExports.length}`);
    output.push(`  Unused files found: ${result.raw.unusedFiles.length}`);
    output.push(`  Fixable exports: ${result.metadata.stats.fixableExports}`);
    output.push(`  Deletable files: ${result.metadata.stats.deletableFiles}`);
    output.push(`  Analysis duration: ${result.raw.duration}ms`);

    // Suggestions
    if (result.suggestions.length > 0) {
      output.push('');
      output.push(chalk.green.bold('💡 Suggestions:'));
      result.suggestions.forEach((suggestion, index) => {
        const confidenceColor =
          suggestion.confidence === 'high'
            ? chalk.green
            : suggestion.confidence === 'medium'
              ? chalk.yellow
              : chalk.red;
        output.push(`  ${index + 1}. ${suggestion.description}`);
        output.push(`     File: ${suggestion.file}`);
        output.push(
          `     Confidence: ${confidenceColor(suggestion.confidence)}`,
        );
      });
    }

    // Footer warnings
    if (
      result.raw.unusedExports.length > 0 ||
      result.raw.unusedFiles.length > 0
    ) {
      output.push('');
      output.push(
        chalk.yellow('⚠️  Please verify findings before removing code!'),
      );
      output.push(
        chalk.yellow('   Consider using --dry-run first to preview changes.'),
      );
    }

    return output.join('\n');
  }

  /**
   * Generate a human-readable summary of analysis results
   * @param result - Processed analysis result
   * @returns Summary string
   */
  private generateSummary(result: ProcessedResult): string {
    const { unusedExports, unusedFiles, errors, totalFiles } = result.raw;

    if (errors.length > 0) {
      return `Analysis completed with ${errors.length} error(s) across ${totalFiles} files`;
    }

    if (unusedExports.length === 0 && unusedFiles.length === 0) {
      return `No unused code detected in ${totalFiles} files - project looks clean!`;
    }

    const parts: string[] = [];
    if (unusedExports.length > 0) {
      parts.push(`${unusedExports.length} unused export(s)`);
    }
    if (unusedFiles.length > 0) {
      parts.push(`${unusedFiles.length} unused file(s)`);
    }

    return `Found ${parts.join(' and ')} in ${totalFiles} files`;
  }

  /**
   * Parse CLI arguments into CliOptions
   * @param args - Raw CLI arguments
   * @returns Parsed CLI options
   */
  private parseCliArgs(args: string[]): CliOptions {
    const flags: string[] = [];
    const positional: string[] = [];
    const options: CliOptions = {};

    // Separate flags and positional arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        flags.push(arg);

        // Handle flags with values
        if (arg === '--tsconfig' && i + 1 < args.length) {
          options.tsConfigFile = args[++i];
        } else if (arg === '--project-root' && i + 1 < args.length) {
          options.projectRoot = args[++i];
        } else if (arg === '--timeout' && i + 1 < args.length) {
          const timeout = parseInt(args[++i], 10);
          if (!isNaN(timeout)) {
            options.timeout = timeout;
          }
        } else if (arg === '--severity' && i + 1 < args.length) {
          const severity = args[++i] as 'all' | 'high' | 'medium';
          if (['all', 'high', 'medium'].includes(severity)) {
            options.severity = severity;
          }
        }
      } else if (!arg.startsWith('-')) {
        positional.push(arg);
      }
    }

    // Set boolean flags
    options.help = flags.includes('--help');
    options.autoFix = flags.includes('--fix') || flags.includes('--auto-fix');
    options.json = flags.includes('--json');
    options.verbose = flags.includes('--verbose') || flags.includes('-v');
    options.dryRun = flags.includes('--dry-run');
    options.includeDts = flags.includes('--include-dts');
    options.recursive = flags.includes('--recursive');
    options.progress = flags.includes('--progress');

    // Handle positional arguments as entry points
    if (positional.length > 0) {
      options.entrypoints = positional;
    }

    return options;
  }

  /**
   * Display CLI help information
   */
  private showHelp(): void {
    console.info(`
${chalk.bold('Usage:')} ts-unused-code [options] [entrypoints...]

${chalk.bold('Description:')}
  Detect unused exports and modules in TypeScript projects.

${chalk.bold('Options:')}
  --fix, --auto-fix      Automatically remove unused exports and files
  --json                 Output results in JSON format
  --verbose, -v          Enable verbose output with code snippets
  --dry-run              Show what would be done without making changes
  --progress             Show progress during analysis
  --include-dts          Include .d.ts files in analysis
  --recursive            Enable recursive dependency analysis
  --tsconfig <path>      Path to tsconfig.json file
  --project-root <path>  Project root directory
  --severity <level>     Filter by severity: all, high, medium
  --timeout <ms>         Timeout for analysis in milliseconds
  --help                 Show this help message

${chalk.bold('Examples:')}
  ts-unused-code                    # Analyze current project
  ts-unused-code --fix              # Analyze and auto-fix issues
  ts-unused-code --json             # Output JSON for programmatic use
  ts-unused-code src/**/*.ts        # Analyze specific entry points
  ts-unused-code --dry-run --verbose # Preview changes with details

${chalk.bold('Entry Points:')}
  Entry points define the boundaries of your application. Code reachable from
  these entry points is considered "used". If not specified, common patterns
  like index.ts, main.ts, and package.json main/exports are used.

${chalk.bold('False Positives Warning:')}
  This tool may report false positives for:
  - Dynamic imports and runtime-only usage
  - Framework-specific patterns and conventions
  - Type-only imports and JSDoc references
  - Test files and development dependencies

  Always review findings before removing code!
`);
  }
}
