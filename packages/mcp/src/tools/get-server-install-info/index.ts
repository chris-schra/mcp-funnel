import { BaseCoreTool } from '../base-core-tool.js';
import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { RegistryContext } from '../../registry/registry-context.js';

/**
 * Tool for getting server installation information from the MCP registry
 */
export class GetServerInstallInfo extends BaseCoreTool {
  readonly name = 'get_server_install_info';

  readonly tool: Tool = {
    name: this.name,
    description:
      'Get installation instructions and configuration for a specific MCP server from the registry',
    inputSchema: {
      type: 'object',
      properties: {
        registryId: {
          type: 'string',
          description: 'The unique registry identifier for the server',
        },
      },
      required: ['registryId'],
    },
  };

  async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    const registryId = args.registryId as string;

    if (!registryId || typeof registryId !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Missing or invalid "registryId" parameter. Please provide a valid registry ID.',
          },
        ],
      };
    }

    try {
      const registryContext = RegistryContext.getInstance(context.config);
      const server = await registryContext.getServerDetails(registryId);

      if (!server) {
        return {
          content: [
            {
              type: 'text',
              text: `Server not found: ${registryId}\n\nThe server with ID "${registryId}" was not found in any configured registry. Please check the registry ID and try again.`,
            },
          ],
        };
      }

      // Generate installation information from the server details
      const installInfo = await registryContext.generateInstallInfo(server);

      // Format the response with all installation information
      const response = {
        name: installInfo.name,
        description: installInfo.description,
        configSnippet: installInfo.configSnippet,
        installInstructions: installInfo.installInstructions,
        tools: installInfo.tools,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[GetServerInstallInfo] Error:', error);

      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving server information: ${errorMessage}`,
          },
        ],
      };
    }
  }
}
