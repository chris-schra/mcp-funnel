/**
 * SearchRegistryTools implementation for searching MCP registry servers.
 *
 * Provides keyword-based search across configured MCP registries to discover
 * available servers and tools. Returns minimal server information optimized
 * for token efficiency.
 * @public
 * @see file:../../mcp-registry/index.ts - RegistryContext implementation
 */

import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { RegistryContext } from '../../mcp-registry/index.js';

/**
 * Core tool for searching MCP registry servers by keywords.
 *
 * Searches across configured registries (official, community, custom) to find
 * servers matching search keywords. Useful for discovering new tools to install.
 * @public
 * @see file:../core-tool.interface.ts - Core tool interface
 */
export class SearchRegistryTools extends BaseCoreTool {
  public readonly name = 'search_registry_tools';

  public get tool(): Tool {
    return {
      name: this.name,
      description:
        'Search MCP registry for available tools and servers by keywords. Returns minimal server information optimized for token efficiency.',
      inputSchema: {
        type: 'object',
        properties: {
          keywords: {
            type: 'string',
            description:
              'Space-separated keywords to search for in server names, descriptions, and tool names',
          },
          registry: {
            type: 'string',
            description:
              'Optional registry ID to search within a specific registry (e.g., "official", "community")',
            optional: true,
          },
        },
        required: ['keywords'],
      },
    };
  }

  /**
   * Handles search request for registry servers.
   *
   * Searches configured registries for servers matching keywords. Optionally
   * limits search to a specific registry if provided.
   * @param args - Search arguments with keywords and optional registry filter
   * @param context - Core tool context with configuration access
   * @returns CallToolResult with matching servers or error message
   * @throws {Error} When keywords are invalid or registry search fails
   * @public
   */
  public async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    // Validate input parameters
    const keywords = args.keywords as string;
    const registry = args.registry as string | undefined;

    if (!keywords || typeof keywords !== 'string') {
      throw new Error('Missing or invalid "keywords" parameter');
    }

    if (registry && typeof registry !== 'string') {
      throw new Error('Invalid "registry" parameter - must be a string');
    }

    try {
      // Get RegistryContext singleton instance
      const registryContext = RegistryContext.getInstance(context.config, {
        configPath: context.configPath,
      });

      // Search for servers
      const result = await registryContext.searchServers(keywords, registry);

      // Return results optimized for token efficiency
      if (!result.found || !result.servers || result.servers.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No servers found matching keywords: ${keywords}${
                registry ? ` in registry: ${registry}` : ''
              }\n\nTry broader search terms or check available registries.`,
            },
          ],
        };
      }

      // Format server list with minimal information for token efficiency
      const serverList = result.servers
        .map(
          (server) =>
            `• ${server.name} (${server.registryId})\n  ${server.description}\n  Type: ${
              server.isRemote ? 'Remote' : 'Local'
            } | Registry: ${server.registryType || 'unknown'}`,
        )
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `${result.message}\n\n${serverList}\n\n💡 Use get_server_install_info with a registryId to get installation details for any server.`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Registry search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
