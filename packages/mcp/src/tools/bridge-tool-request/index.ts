import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { resolveToolName } from '../../utils/tool-resolver.js';

export interface BridgeToolRequestParams {
  tool: string;
  arguments?: Record<string, unknown>;
}

export class BridgeToolRequest extends BaseCoreTool {
  readonly name = 'bridge_tool_request';

  get tool(): Tool {
    return {
      name: this.name,
      description:
        'Execute any discovered tool dynamically. First use get_tool_schema to understand the required arguments structure.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description:
              'Full tool name from discover_tools_by_words (e.g., "github__create_issue")',
          },
          arguments: {
            type: 'object',
            description:
              "Arguments matching the tool's inputSchema (obtained from get_tool_schema)",
            additionalProperties: true,
          },
        },
        required: ['tool'],
      },
    };
  }

  async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    if (typeof args.tool !== 'string') {
      throw new Error('Missing or invalid "tool" parameter');
    }

    const toolArguments = args.arguments as Record<string, unknown> | undefined;

    if (!context.toolMapping) {
      throw new Error('Tool mapping not available in context');
    }

    // Use the shared resolver
    const resolution = resolveToolName(
      args.tool,
      context.toolMapping,
      context.config,
    );

    if (!resolution.resolved) {
      const message =
        resolution.error?.message || `Tool not found: ${args.tool}`;
      const fullMessage = resolution.error?.isAmbiguous
        ? message
        : `${message} Recommended flow: get_tool_schema for the tool, then use bridge_tool_request with {"tool":"<full_name>","arguments":{...}}.`;

      return {
        content: [
          {
            type: 'text',
            text: fullMessage,
          },
        ],
        isError: true,
      };
    }

    const toolName = resolution.toolName!;
    const mapping = context.toolMapping.get(toolName);
    if (!mapping) {
      throw new Error(
        `Internal error: resolved tool ${toolName} not found in mapping`,
      );
    }

    try {
      if (!mapping.client) {
        throw new Error(`Tool ${toolName} has no client connection`);
      }
      const result = await mapping.client.callTool({
        name: mapping.originalName,
        arguments: toolArguments,
      });

      return result as CallToolResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute tool ${toolName}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
}
