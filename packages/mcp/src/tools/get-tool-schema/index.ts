import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { resolveToolName } from '../../utils/tool-resolver.js';

export interface GetToolSchemaParams {
  tool: string;
}

export class GetToolSchema extends BaseCoreTool {
  readonly name = 'get_tool_schema';

  get tool(): Tool {
    return {
      name: this.name,
      description:
        'Get the input schema for a specific tool. Use the returned schema to understand what arguments are required for bridge_tool_request.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description:
              'Full tool name including server prefix (e.g., "github__create_issue")',
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

    // Get tool from registry
    const toolState = context.toolRegistry.getToolState(args.tool);

    if (!toolState || !toolState.definition) {
      // Try short name resolution if enabled
      if (context.config.allowShortToolNames && context.toolMapping) {
        const resolution = resolveToolName(
          args.tool,
          context.toolMapping,
          context.config,
        );

        if (!resolution.resolved) {
          return {
            content: [
              {
                type: 'text',
                text:
                  resolution.error?.message ||
                  `Tool not found: ${args.tool}. Use discover_tools_by_words to find available tools.`,
              },
            ],
          };
        }

        const resolvedTool = context.toolRegistry.getToolState(
          resolution.toolName!,
        );
        if (!resolvedTool || !resolvedTool.definition) {
          return {
            content: [
              {
                type: 'text',
                text: `Tool not found: ${args.tool}. Use discover_tools_by_words to find available tools.`,
              },
            ],
          };
        }

        const response = {
          tool: resolution.toolName!,
          inputSchema: resolvedTool.definition.inputSchema || {
            type: 'object',
            properties: {},
          },
          description: resolvedTool.definition.description || '',
          usage: `To call this tool, use bridge_tool_request with:\n{\n  "tool": "${resolution.toolName}",\n  "arguments": <object matching inputSchema>\n}`,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Tool not found: ${args.tool}. Use discover_tools_by_words to find available tools.`,
          },
        ],
      };
    }

    const response = {
      tool: args.tool,
      inputSchema: toolState.definition.inputSchema || {
        type: 'object',
        properties: {},
      },
      description: toolState.definition.description || '',
      usage: `To call this tool, use bridge_tool_request with:\n{\n  "tool": "${args.tool}",\n  "arguments": <object matching inputSchema>\n}`,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }
}
