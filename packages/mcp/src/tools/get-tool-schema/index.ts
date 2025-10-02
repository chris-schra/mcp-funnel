import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { resolveToolName } from '../../utils/tool-resolver.js';

export interface GetToolSchemaParams {
  tool: string;
}

export class GetToolSchema extends BaseCoreTool {
  public readonly name = 'get_tool_schema';

  public get tool(): Tool {
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

  private createTextResponse(text: string): CallToolResult {
    return {
      content: [{ type: 'text', text }],
    };
  }

  private createSchemaResponse(
    toolName: string,
    inputSchema: unknown,
    description: string | undefined,
  ): CallToolResult {
    const response = {
      tool: toolName,
      inputSchema: inputSchema || { type: 'object', properties: {} },
      description: description || '',
      usage: `To call this tool, use bridge_tool_request with:\n{\n  "tool": "${toolName}",\n  "arguments": <object matching inputSchema>\n}`,
    };

    return this.createTextResponse(JSON.stringify(response, null, 2));
  }

  private tryShortNameResolution(
    toolName: string,
    context: CoreToolContext,
  ): CallToolResult | null {
    if (!context.config.allowShortToolNames || !context.toolMapping) {
      return null;
    }

    const resolution = resolveToolName(
      toolName,
      context.toolMapping,
      context.config,
    );

    if (!resolution.resolved) {
      return this.createTextResponse(
        resolution.error?.message ||
          `Tool not found: ${toolName}. Use discover_tools_by_words to find available tools.`,
      );
    }

    const resolvedTool = context.toolRegistry.getToolState(
      resolution.toolName!,
    );

    if (!resolvedTool || !resolvedTool.definition) {
      return this.createTextResponse(
        `Tool not found: ${toolName}. Use discover_tools_by_words to find available tools.`,
      );
    }

    return this.createSchemaResponse(
      resolution.toolName!,
      resolvedTool.definition.inputSchema,
      resolvedTool.definition.description,
    );
  }

  public async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    if (typeof args.tool !== 'string') {
      throw new Error('Missing or invalid "tool" parameter');
    }

    const toolState = context.toolRegistry.getToolState(args.tool);

    if (!toolState || !toolState.definition) {
      const shortNameResult = this.tryShortNameResolution(args.tool, context);
      if (shortNameResult) {
        return shortNameResult;
      }

      return this.createTextResponse(
        `Tool not found: ${args.tool}. Use discover_tools_by_words to find available tools.`,
      );
    }

    return this.createSchemaResponse(
      args.tool,
      toolState.definition.inputSchema,
      toolState.definition.description,
    );
  }
}
