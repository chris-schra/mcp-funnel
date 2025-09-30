import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import {
  NPMClient,
  PackageNotFoundError,
  NPMRegistryError,
} from './npm-client.js';
import { MAX_SEARCH_RESULTS } from './types.js';
import {
  validatePackageNameParameter,
  validateQueryParameter,
  validateLimitParameter,
  createErrorResponse,
  createTextResponse,
  parseCLIArgs,
} from './util/index.js';

/**
 * NPM command implementation for MCP Funnel.
 *
 * Provides package lookup and search functionality via NPM Registry API,
 * supporting both MCP protocol tool calls and direct CLI execution.
 *
 * Available tools:
 * - lookup: Get detailed package information including dependencies and metadata
 * - search: Search for packages by query with configurable result limits
 * @example MCP tool usage
 * ```typescript
 * const cmd = new NPMCommand();
 * const result = await cmd.executeToolViaMCP('lookup', { packageName: 'react' });
 * ```
 * @example CLI usage
 * ```typescript
 * const cmd = new NPMCommand();
 * await cmd.executeViaCLI(['lookup', 'react']);
 * await cmd.executeViaCLI(['search', 'typescript', '--limit', '10']);
 * ```
 * @public
 * @see file:./npm-client.ts - NPM Registry API client
 */
export class NPMCommand implements ICommand {
  public readonly name = 'npm';
  public readonly description = 'NPM package lookup and search';
  private client: NPMClient;

  /**
   * Creates NPM command instance.
   * @param client - Optional NPMClient instance for dependency injection (primarily for testing)
   */
  public constructor(client?: NPMClient) {
    this.client = client || new NPMClient();
  }

  /**
   * Returns MCP tool definitions for lookup and search operations.
   *
   * Provides tool schemas that describe parameters, types, and requirements
   * for the MCP protocol integration.
   * @returns Array of tool definitions with input schemas
   */
  public getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'lookup',
        description: 'Get detailed information about an NPM package',
        inputSchema: {
          type: 'object',
          properties: {
            packageName: {
              type: 'string',
              description: 'Package name',
            },
            version: {
              type: 'string',
              description: 'Specific version (optional)',
            },
          },
          required: ['packageName'],
        },
      },
      {
        name: 'search',
        description: 'Search for NPM packages',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: `Max results (default: 20, max: ${MAX_SEARCH_RESULTS})`,
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  /**
   * Executes a tool via MCP protocol.
   *
   * Validates parameters, calls the NPM Registry API, and formats responses
   * according to MCP protocol requirements. Handles all error cases including
   * validation failures, network errors, and package not found scenarios.
   * @param toolName - Name of the tool to execute ('lookup' or 'search')
   * @param args - Tool arguments (packageName for lookup, query/limit for search)
   * @returns CallToolResult with formatted package data or error message
   * @throws Never throws - all errors are returned as CallToolResult with isError flag
   */
  public async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      switch (toolName) {
        case 'lookup': {
          const packageNameValidation = validatePackageNameParameter(
            args.packageName,
          );
          if (!packageNameValidation.valid) {
            return createErrorResponse(packageNameValidation.error);
          }

          const packageInfo = await this.client.getPackage(
            packageNameValidation.value,
          );

          return createTextResponse(
            JSON.stringify(packageInfo, null, 2),
            'Follow the homepage and repository links for more information about the package if usage examples are required.',
          );
        }

        case 'search': {
          const queryValidation = validateQueryParameter(args.query);
          if (!queryValidation.valid) {
            return createErrorResponse(queryValidation.error);
          }

          const limitValidation = validateLimitParameter(args.limit);
          if (!limitValidation.valid) {
            return createErrorResponse(limitValidation.error);
          }

          const results = await this.client.searchPackages(
            queryValidation.value,
            limitValidation.value,
          );
          return createTextResponse(JSON.stringify(results, null, 2));
        }

        default:
          return createErrorResponse(`Error: Unknown tool: ${toolName}`);
      }
    } catch (error) {
      if (error instanceof PackageNotFoundError) {
        return createErrorResponse(`Package not found: ${error.message}`);
      }

      if (error instanceof NPMRegistryError) {
        return createErrorResponse(`NPM Registry error: ${error.message}`);
      }

      return createErrorResponse(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Executes command via CLI interface.
   *
   * Parses CLI arguments, executes the requested operation, and outputs
   * results to stdout. Exits process with code 1 on errors.
   *
   * Supported commands:
   * - npm lookup \<package-name\>
   * - npm search \<query\> [--limit N]
   * @param args - CLI arguments array (excluding 'npm' prefix)
   * @throws Never throws - errors are logged to stderr and process.exit(1) is called
   */
  public async executeViaCLI(args: string[]): Promise<void> {
    try {
      const parsed = parseCLIArgs(args);

      if (parsed.subcommand === 'lookup') {
        if (!parsed.packageName) {
          console.error('Usage: npm lookup <package-name>');
          process.exit(1);
        }
        const result = await this.client.getPackage(parsed.packageName);
        console.info(JSON.stringify(result, null, 2));
      } else if (parsed.subcommand === 'search') {
        if (!parsed.query) {
          console.error('Usage: npm search <query>');
          process.exit(1);
        }
        const results = await this.client.searchPackages(
          parsed.query,
          parsed.limit,
        );
        console.info(JSON.stringify(results, null, 2));
      } else {
        console.error('Usage: npm <lookup|search> ...');
        console.error('  npm lookup <package-name>');
        console.error('  npm search <query> [--limit <number>]');
        process.exit(1);
      }
    } catch (error) {
      if (error instanceof PackageNotFoundError) {
        console.error(`Package not found: ${error.message}`);
        process.exit(1);
      }

      if (error instanceof NPMRegistryError) {
        console.error(`NPM Registry error: ${error.message}`);
        process.exit(1);
      }

      console.error(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  }
}
