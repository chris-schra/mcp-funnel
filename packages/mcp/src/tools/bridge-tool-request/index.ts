import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { resolveToolName } from '../../utils/tool-resolver.js';

/**
 * Parameters for bridge tool request execution.
 *
 * @public
 */
export interface BridgeToolRequestParams {
  /** Full tool name from tool registry (e.g., "github__create_issue") */
  tool: string;
  /** Arguments matching the tool's input schema */
  arguments?: Record<string, unknown>;
}

/**
 * Core tool for dynamically executing discovered tools from connected servers.
 *
 * This tool acts as a bridge between the MCP client and discovered tools,
 * allowing dynamic tool execution with automatic enablement and short name resolution.
 *
 * Key features:
 * - Auto-enables tools that are discovered but not yet exposed
 * - Supports short tool name resolution when configured
 * - Routes execution to appropriate server or command
 * - Provides clear error messages with resolution guidance
 *
 * @example
 * ```typescript
 * // Execute a tool with full name
 * const result = await bridgeTool.handle(
 *   {
 *     tool: 'github__create_issue',
 *     arguments: { title: 'Bug report', body: 'Details...' },
 *   },
 *   context
 * );
 * ```
 *
 * @public
 * @see {@link BaseCoreTool} - Base class implementation
 * @see {@link BridgeToolRequestParams} - Parameter interface
 */
export class BridgeToolRequest extends BaseCoreTool {
  public readonly name = 'bridge_tool_request';

  public get tool(): Tool {
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

  public async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    if (typeof args.tool !== 'string') {
      throw new Error('Missing or invalid "tool" parameter');
    }

    const toolArguments = args.arguments as Record<string, unknown> | undefined;
    const resolutionResult = await this.resolveAndPrepareTool(args.tool, context);

    if ('error' in resolutionResult) {
      return resolutionResult.error;
    }

    return this.executeTool(
      resolutionResult.toolState,
      resolutionResult.resolvedName,
      toolArguments,
    );
  }

  /**
   * Resolves tool name and prepares tool state for execution.
   * Handles short name resolution and auto-enabling of discovered tools.
   *
   * @param requestedTool - The tool name requested by the user
   * @param context - The core tool context containing registry and configuration
   * @returns Tool state and resolved name, or an error result
   */
  private async resolveAndPrepareTool(
    requestedTool: string,
    context: CoreToolContext,
  ): Promise<
    | {
        toolState: NonNullable<ReturnType<typeof context.toolRegistry.getToolForExecution>>;
        resolvedName: string;
      }
    | { error: CallToolResult }
  > {
    const resolution = this.resolveToolName(requestedTool, context);
    if ('error' in resolution) {
      return { error: resolution.error };
    }

    let toolState = context.toolRegistry.getToolForExecution(resolution.resolvedName);

    if (!toolState) {
      const enableResult = await this.tryAutoEnableTool(
        resolution.resolvedName,
        requestedTool,
        context,
      );
      if ('error' in enableResult) {
        return { error: enableResult.error };
      }
      toolState = enableResult.toolState;
    }

    return { toolState, resolvedName: resolution.resolvedName };
  }

  /**
   * Resolves the tool name, handling short name resolution if enabled.
   *
   * @param requestedTool - The tool name requested by the user
   * @param context - The core tool context containing configuration and mapping
   * @returns Resolved tool name or an error result
   */
  private resolveToolName(
    requestedTool: string,
    context: CoreToolContext,
  ): { resolvedName: string } | { error: CallToolResult } {
    const toolState = context.toolRegistry.getToolForExecution(requestedTool);

    if (toolState) {
      return { resolvedName: requestedTool };
    }

    if (!context.config.allowShortToolNames || !context.toolMapping) {
      return { resolvedName: requestedTool };
    }

    const resolution = resolveToolName(requestedTool, context.toolMapping, context.config);

    if (!resolution.resolved) {
      return { error: this.createResolutionError(requestedTool, resolution) };
    }

    return { resolvedName: resolution.toolName! };
  }

  /**
   * Creates an error response for failed tool resolution.
   *
   * @param requestedTool - The tool name that failed to resolve
   * @param resolution - The resolution result containing error details
   * @returns Error result with descriptive message
   */
  private createResolutionError(
    requestedTool: string,
    resolution: ReturnType<typeof resolveToolName>,
  ): CallToolResult {
    const message = resolution.error?.message || `Tool not found or not exposed: ${requestedTool}`;
    const fullMessage = resolution.error?.isAmbiguous
      ? message
      : `${message} Recommended flow: get_tool_schema for the tool, then use bridge_tool_request with {"tool":"<full_name>","arguments":{...}}.`;

    return {
      content: [{ type: 'text', text: fullMessage }],
      isError: true,
    };
  }

  /**
   * Attempts to auto-enable a discovered but not exposed tool.
   *
   * @param resolvedName - The resolved full tool name
   * @param requestedTool - The original tool name from the user request
   * @param context - The core tool context containing registry
   * @returns Tool state after enabling, or an error result
   */
  private async tryAutoEnableTool(
    resolvedName: string,
    requestedTool: string,
    context: CoreToolContext,
  ): Promise<
    | {
        toolState: NonNullable<ReturnType<typeof context.toolRegistry.getToolForExecution>>;
      }
    | { error: CallToolResult }
  > {
    const discoveredTool = context.toolRegistry.getToolState(resolvedName);

    if (!discoveredTool || discoveredTool.exposed) {
      return {
        error: {
          content: [
            {
              type: 'text',
              text: `Tool not found or not exposed: ${requestedTool}. Use discover_tools_by_words to find available tools.`,
            },
          ],
          isError: true,
        },
      };
    }

    context.toolRegistry.enableTools([resolvedName], 'discovery');
    await context.sendNotification?.('tools/list_changed');

    const toolState = context.toolRegistry.getToolForExecution(resolvedName);

    if (!toolState) {
      return {
        error: {
          content: [
            {
              type: 'text',
              text: `Failed to auto-enable tool: ${requestedTool}. Please try discover_tools_by_words to enable it manually.`,
            },
          ],
          isError: true,
        },
      };
    }

    console.info(`[bridge-tool-request] Auto-enabled tool: ${resolvedName}`);
    return { toolState };
  }

  /**
   * Executes the tool via command or server client.
   *
   * @param toolState - The tool state containing executor information
   * @param resolvedName - The resolved tool name for error messages
   * @param toolArguments - Optional arguments to pass to the tool
   * @returns The tool execution result or an error result
   */
  private async executeTool(
    toolState: NonNullable<ReturnType<CoreToolContext['toolRegistry']['getToolForExecution']>>,
    resolvedName: string,
    toolArguments: Record<string, unknown> | undefined,
  ): Promise<CallToolResult> {
    try {
      if (toolState.command) {
        return (await toolState.command.executeToolViaMCP(
          toolState.originalName,
          toolArguments || {},
        )) as CallToolResult;
      }

      if (toolState.client) {
        return (await toolState.client.callTool({
          name: toolState.originalName,
          arguments: toolArguments,
        })) as CallToolResult;
      }

      throw new Error(`Tool ${resolvedName} has no executor`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute tool ${resolvedName}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
}
