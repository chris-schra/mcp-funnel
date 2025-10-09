/**
 * CLI handlers for TSCI command.
 *
 * Separates CLI-specific concerns (argument parsing, output formatting, process management)
 * from core MCP tool functionality.
 *
 * @internal
 */

import type { TSCICommand } from './command.js';
import type { CallToolResult } from '@mcp-funnel/commands-core';
import type { CommandArgs } from './types/common.js';

/**
 * Parsed CLI arguments structure
 */
interface ParsedCliArgs {
  positional: string[];
  flags: Map<string, string>;
}

/**
 * CLI handler for TSCI command.
 *
 * Handles argument parsing, output formatting, and process lifecycle
 * for direct CLI invocation. Delegates to TSCICommand for tool execution.
 */
export class CLIHandlers {
  private readonly command: TSCICommand;

  /**
   * Creates CLI handler instance.
   * @param command - TSCICommand instance to delegate tool execution to
   */
  public constructor(command: TSCICommand) {
    this.command = command;
  }

  /**
   * Shows CLI help information.
   * Displays usage, available commands, and examples.
   */
  public showHelp(): void {
    console.info(`
TypeScript Code Intelligence - AI-optimized codebase exploration

Usage:
  tsci <command> [options]

Commands:
  describe-file <file> [--verbosity <level>]
    Get symbols and type information from a TypeScript file

    Arguments:
      file                    File path relative to project root

    Options:
      --verbosity <level>     Output detail level: minimal | normal | detailed
                              (default: minimal)

    Examples:
      tsci describe-file src/command.ts
      tsci describe-file src/command.ts --verbosity normal
      tsci describe-file src/command.ts --verbosity detailed

  describe-symbol <symbolId> [--verbosity <level>]
    Get detailed information about a specific symbol

    Arguments:
      symbolId                Symbol ID from describe-file output

    Options:
      --verbosity <level>     Output detail level: minimal | normal | detailed
                              (default: minimal)

    Examples:
      tsci describe-symbol "TSCICommand:128:src/command.ts:65"
      tsci describe-symbol "TSCICommand:128:src/command.ts:65" --verbosity detailed

  understand-context <file1> [file2...] [--focus <file>]
    Generate Mermaid diagram showing file relationships

    Arguments:
      file1, file2...         Files to include in diagram (relative to project root)

    Options:
      --focus <file>          File to highlight in the diagram (optional)

    Examples:
      tsci understand-context src/command.ts src/core/engine.ts
      tsci understand-context src/command.ts src/core/engine.ts --focus src/command.ts

  help, --help, -h
    Show this help message
`);
  }

  /**
   * Parses CLI arguments into positional args and flags.
   *
   * Supports both --flag=value and --flag value syntax.
   * @param args - Raw CLI arguments
   * @returns Parsed positional arguments and flags map
   */
  public parseArgs(args: string[]): ParsedCliArgs {
    const positional: string[] = [];
    const flags = new Map<string, string>();

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        // Handle --flag=value syntax
        const eqIdx = arg.indexOf('=');
        if (eqIdx > 0) {
          const key = arg.slice(2, eqIdx);
          const value = arg.slice(eqIdx + 1);
          flags.set(key, value);
        } else {
          // Handle --flag value syntax
          const key = arg.slice(2);
          if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
            flags.set(key, args[++i]);
          } else {
            // Flag without value
            flags.set(key, 'true');
          }
        }
      } else {
        positional.push(arg);
      }
    }

    return { positional, flags };
  }

  /**
   * Handles describe-file CLI command.
   *
   * Parses arguments, calls tool handler, and formats output.
   * @param args - CLI arguments after subcommand
   */
  public async handleDescribeFile(args: string[]): Promise<void> {
    const parsed = this.parseArgs(args);

    if (parsed.positional.length === 0) {
      console.error('Error: file path is required');
      console.error('');
      console.error('Usage: tsci describe-file <file> [--verbosity <level>]');
      console.error('');
      console.error('Examples:');
      console.error('  tsci describe-file src/command.ts');
      console.error('  tsci describe-file src/command.ts --verbosity normal');
      process.exit(1);
    }

    const file = parsed.positional[0];
    const verbosity = (parsed.flags.get('verbosity') || 'minimal') as 'minimal';

    // Validate verbosity value
    if (!['minimal', 'normal', 'detailed'].includes(verbosity)) {
      console.error(`Error: Invalid verbosity level: ${verbosity}`);
      console.error('Valid values: minimal, normal, detailed');
      process.exit(1);
    }

    const result = await this.command.executeHandler('describe-file', { file, verbosity });

    this.outputResult(result);
  }

  /**
   * Handles describe-symbol CLI command.
   *
   * Parses arguments, calls tool handler, and formats output.
   * @param args - CLI arguments after subcommand
   */
  public async handleDescribeSymbol(args: string[]): Promise<void> {
    const parsed = this.parseArgs(args);

    if (parsed.positional.length === 0) {
      console.error('Error: symbolId is required');
      console.error('');
      console.error('Usage: tsci describe-symbol <symbolId> [--verbosity <level>]');
      console.error('');
      console.error('Examples:');
      console.error('  tsci describe-symbol "TSCICommand:128:src/command.ts:65"');
      console.error(
        '  tsci describe-symbol "TSCICommand:128:src/command.ts:65" --verbosity detailed',
      );
      process.exit(1);
    }

    const symbolId = parsed.positional[0];
    const verbosity = (parsed.flags.get('verbosity') || 'minimal') as 'minimal';

    // Validate verbosity value
    if (!['minimal', 'normal', 'detailed'].includes(verbosity)) {
      console.error(`Error: Invalid verbosity level: ${verbosity}`);
      console.error('Valid values: minimal, normal, detailed');
      process.exit(1);
    }

    const result = await this.command.executeHandler('describe-symbol', { symbolId, verbosity });

    this.outputResult(result);
  }

  /**
   * Handles understand-context CLI command.
   *
   * Parses arguments, calls tool handler, and formats output.
   * @param args - CLI arguments after subcommand
   */
  public async handleUnderstandContext(args: string[]): Promise<void> {
    const parsed = this.parseArgs(args);

    if (parsed.positional.length === 0) {
      console.error('Error: at least one file path is required');
      console.error('');
      console.error('Usage: tsci understand-context <file1> [file2...] [--focus <file>]');
      console.error('');
      console.error('Examples:');
      console.error('  tsci understand-context src/command.ts src/core/engine.ts');
      console.error(
        '  tsci understand-context src/command.ts src/core/engine.ts --focus src/command.ts',
      );
      process.exit(1);
    }

    const files = parsed.positional;
    const focus = parsed.flags.get('focus');

    const requestArgs: CommandArgs = { files };
    if (focus) {
      requestArgs.focus = focus;
    }

    const result = await this.command.executeHandler('understand-context', requestArgs);

    this.outputResult(result);
  }

  /**
   * Outputs a CallToolResult to console and exits with appropriate code.
   *
   * Handles both success and error cases, including optional hint content.
   * @param result - CallToolResult from tool handler
   */
  private outputResult(result: CallToolResult): void {
    if (result.isError) {
      console.error(result.content[0].text);
      this.command.cleanup();
      process.exit(1);
    }

    // Print main response
    console.info(result.content[0].text);

    // Print hint if present
    if (result.content.length > 1) {
      console.info('');
      console.info('Hint:', result.content[1].text);
    }

    // Cleanup and exit successfully
    this.command.cleanup();
    process.exit(0);
  }
}
