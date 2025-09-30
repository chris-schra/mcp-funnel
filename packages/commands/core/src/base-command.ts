/**
 * Base abstract class for MCP Funnel commands.
 *
 * Provides common functionality including option parsing and logging helpers
 * that handle both MCP protocol and CLI execution contexts.
 * @remarks
 * Subclasses must implement the ICommand interface methods to define
 * command-specific behavior for tool execution and MCP tool definitions.
 * @example Basic command implementation
 * ```typescript
 * export class MyCommand extends BaseCommand {
 *   readonly name = 'my-command';
 *   readonly description = 'My command description';
 *
 *   async executeToolViaMCP(toolName: string, args: Record<string, unknown>) {
 *     const options = this.parseCommonOptions(args);
 *     // Implementation
 *   }
 *
 *   async executeViaCLI(args: string[]) {
 *     const options = this.parseCommonOptions(args);
 *     this.log('Processing...', options);
 *     // Implementation
 *   }
 *
 *   getMCPDefinitions() {
 *     return [{ name: this.name, description: this.description, inputSchema: {} }];
 *   }
 * }
 * ```
 * @see file:./interfaces.ts:8 - ICommand interface definition
 * @public
 */

import type { ICommand, ICommandOptions } from './interfaces.js';

/**
 * Abstract base class that provides common functionality for all commands.
 * @public
 */
export abstract class BaseCommand implements ICommand {
  public abstract readonly name: string;
  public abstract readonly description: string;

  public abstract executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<import('@modelcontextprotocol/sdk/types.js').CallToolResult>;
  public abstract executeViaCLI(args: string[]): Promise<void>;
  public abstract getMCPDefinitions(): import('@modelcontextprotocol/sdk/types.js').Tool[];

  /**
   * Parse common command options from arguments.
   *
   * Extracts standard options (verbose, dryRun, format) from either
   * MCP protocol arguments (object) or CLI arguments (string array).
   * Supports both `--verbose`/`-v` flags and `--format <type>` options.
   * @param args - MCP arguments as object or CLI arguments as string array
   * @returns Parsed options with verbose, dryRun, and format properties
   * @example MCP usage
   * ```typescript
   * const options = this.parseCommonOptions({ verbose: true, format: 'json' });
   * // Returns: \{ verbose: true, format: 'json' \}
   * ```
   * @example CLI usage
   * ```typescript
   * const options = this.parseCommonOptions(['--verbose', '--format', 'json']);
   * // Returns: \{ verbose: true, format: 'json' \}
   * ```
   */
  protected parseCommonOptions(
    args: Record<string, unknown> | string[],
  ): ICommandOptions {
    const options: ICommandOptions = {};

    if (Array.isArray(args)) {
      // CLI args
      options.verbose = args.includes('--verbose') || args.includes('-v');
      options.dryRun = args.includes('--dry-run');

      const formatIndex = args.findIndex((arg) => arg === '--format');
      if (formatIndex !== -1 && formatIndex < args.length - 1) {
        const format = args[formatIndex + 1];
        if (format === 'json' || format === 'text' || format === 'console') {
          options.format = format;
        }
      }
    } else {
      // MCP args
      options.verbose = Boolean(args.verbose);
      options.dryRun = Boolean(args.dryRun);
      if (
        typeof args.format === 'string' &&
        ['json', 'text', 'console'].includes(args.format)
      ) {
        options.format = args.format as 'json' | 'text' | 'console';
      }
    }

    return options;
  }

  /**
   * Log output based on format preference.
   *
   * Outputs informational messages to console unless format is 'json',
   * in which case logging is suppressed to avoid corrupting JSON output.
   * @param message - The message to log
   * @param options - Command options containing format preference
   * @example
   * ```typescript
   * this.log('Processing complete', { format: 'text' }); // Logs to console
   * this.log('Processing complete', { format: 'json' }); // Suppressed
   * ```
   */
  protected log(message: string, options: ICommandOptions = {}): void {
    if (options.format === 'json') {
      // Skip console logging in JSON mode
      return;
    }
    console.info(message);
  }

  /**
   * Log error output.
   *
   * Outputs error messages to stderr unless format is 'json',
   * in which case logging is suppressed to avoid corrupting JSON output.
   * @param message - The error message to log
   * @param options - Command options containing format preference
   * @example
   * ```typescript
   * this.logError('Failed to process', { format: 'text' }); // Logs to stderr
   * this.logError('Failed to process', { format: 'json' }); // Suppressed
   * ```
   */
  protected logError(message: string, options: ICommandOptions = {}): void {
    if (options.format === 'json') {
      // Skip console logging in JSON mode
      return;
    }
    console.error(message);
  }
}
