/**
 * Base abstract class for MCP Funnel commands
 */

import type { ICommand, ICommandOptions } from './interfaces.js';

/**
 * Abstract base class that provides common functionality for all commands
 */
export abstract class BaseCommand implements ICommand {
  abstract readonly name: string;
  abstract readonly description: string;

  abstract executeViaMCP(
    args: Record<string, unknown>,
  ): Promise<import('@modelcontextprotocol/sdk/types.js').CallToolResult>;
  abstract executeViaCLI(args: string[]): Promise<void>;
  abstract getMCPDefinition(): import('@modelcontextprotocol/sdk/types.js').Tool;

  /**
   * Parse common command options from arguments
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
   * Log output based on format preference
   */
  protected log(message: string, options: ICommandOptions = {}): void {
    if (options.format === 'json') {
      // Skip console logging in JSON mode
      return;
    }
    console.info(message);
  }

  /**
   * Log error output
   */
  protected logError(message: string, options: ICommandOptions = {}): void {
    if (options.format === 'json') {
      // Skip console logging in JSON mode
      return;
    }
    console.error(message);
  }
}
