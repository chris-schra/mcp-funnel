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

    // Try to get tool from registry first
    let toolState = context.toolRegistry.getToolForExecution(args.tool);
    let resolvedToolName = args.tool;

    // If not found directly, try short name resolution if enabled
    if (
      !toolState &&
      context.config.allowShortToolNames &&
      context.toolMapping
    ) {
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

      resolvedToolName = resolution.toolName!;
      toolState = context.toolRegistry.getToolForExecution(resolvedToolName);
    }

    if (!toolState) {
      // Check if the tool exists but is not exposed (discovered but not enabled)
      const discoveredTool = context.toolRegistry.getToolState(resolvedToolName);
      if (discoveredTool && !discoveredTool.exposed) {
        // Auto-enable the tool since it was explicitly requested
        context.toolRegistry.enableTools([resolvedToolName], 'discovery');
        await context.sendNotification?.('tools/list_changed');

        // Get the tool again after enabling
        toolState = context.toolRegistry.getToolForExecution(resolvedToolName);

        if (!toolState) {
          // This shouldn't happen, but handle it gracefully
          return {
            content: [
              {
                type: 'text',
                text: `Failed to auto-enable tool: ${args.tool}. Please try discover_tools_by_words to enable it manually.`,
              },
            ],
            isError: true,
          };
        }

        // Log that we auto-enabled the tool
        console.info(`[bridge-tool-request] Auto-enabled tool: ${resolvedToolName}`);
      } else {
        // Tool doesn't exist at all in the registry
        return {
          content: [
            {
              type: 'text',
              text: `Tool not found: ${args.tool}. Use discover_tools_by_words to find available tools.`,
            },
          ],
          isError: true,
        };
      }
    }

    try {
      // Command path: execute via command interface when present
      if (toolState.command) {
        const result = await toolState.command.executeToolViaMCP(
          toolState.originalName,
          toolArguments || {},
        );
        return result as CallToolResult;
      }

      // Server bridge path
      if (toolState.client) {
        const result = await toolState.client.callTool({
          name: toolState.originalName,
          arguments: toolArguments,
        });
        return result as CallToolResult;
      }

      // Neither server client nor command is available
      throw new Error(`Tool ${resolvedToolName} has no executor`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute tool ${resolvedToolName}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
}
