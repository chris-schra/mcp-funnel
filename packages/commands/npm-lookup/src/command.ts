import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import {
  NPMClient,
  PackageNotFoundError,
  NPMRegistryError,
} from './npm-client.js';

export class NPMCommand implements ICommand {
  readonly name = 'npm';
  readonly description = 'NPM package lookup and search';
  private client: NPMClient;

  constructor(client?: NPMClient) {
    this.client = client || new NPMClient();
  }

  getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'lookup',
        description: 'Get detailed information about an NPM package',
        inputSchema: {
          type: 'object',
          properties: {
            package: {
              type: 'string',
              description: 'Package name',
            },
            version: {
              type: 'string',
              description: 'Specific version (optional)',
            },
          },
          required: ['package'],
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
              description: 'Max results (default: 10, max: 50)',
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      switch (toolName) {
        case 'lookup': {
          if (typeof args.package !== 'string') {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: package parameter must be a string',
                },
              ],
              isError: true,
            };
          }

          const packageInfo = await this.client.getPackage(args.package);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(packageInfo, null, 2),
              },
            ],
          };
        }

        case 'search': {
          if (typeof args.query !== 'string') {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: query parameter must be a string',
                },
              ],
              isError: true,
            };
          }

          const limit = args.limit as number | undefined;
          if (
            limit !== undefined &&
            (typeof limit !== 'number' || limit < 1 || limit > 50)
          ) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: limit must be a number between 1 and 50',
                },
              ],
              isError: true,
            };
          }

          const results = await this.client.searchPackages(args.query, limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: `Error: Unknown tool: ${toolName}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      if (error instanceof PackageNotFoundError) {
        return {
          content: [
            {
              type: 'text',
              text: `Package not found: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      if (error instanceof NPMRegistryError) {
        return {
          content: [
            {
              type: 'text',
              text: `NPM Registry error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  async executeViaCLI(args: string[]): Promise<void> {
    try {
      // Parse subcommand: npm lookup <package> or npm search <query>
      const [subcommand, ...rest] = args;

      if (subcommand === 'lookup') {
        const packageName = rest[0];
        if (!packageName) {
          console.error('Usage: npm lookup <package-name>');
          process.exit(1);
        }
        const result = await this.client.getPackage(packageName);
        console.info(JSON.stringify(result, null, 2));
      } else if (subcommand === 'search') {
        const query = rest.join(' ');
        if (!query) {
          console.error('Usage: npm search <query>');
          process.exit(1);
        }

        // Parse optional --limit flag
        let limit: number | undefined;
        const limitIndex = rest.indexOf('--limit');
        if (limitIndex !== -1 && limitIndex < rest.length - 1) {
          const limitValue = parseInt(rest[limitIndex + 1], 10);
          if (!isNaN(limitValue)) {
            limit = Math.min(Math.max(1, limitValue), 50);
          }
          // Remove --limit and its value from the query
          rest.splice(limitIndex, 2);
        }

        const finalQuery = rest.join(' ');
        const results = await this.client.searchPackages(finalQuery, limit);
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
