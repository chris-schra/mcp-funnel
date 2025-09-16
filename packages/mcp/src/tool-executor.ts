import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from './tools/core-tool.interface.js';
import { ToolMapping } from './tool-collector.js';
import { logEvent, logError } from './logger.js';

/**
 * Handles execution of tools from various sources.
 * Separates the concern of executing tools from collecting and filtering.
 */
export class ToolExecutor {
  constructor(
    private coreTools: Map<string, ICoreTool>,
    private toolMapping: Map<string, ToolMapping>,
    private coreToolContext: CoreToolContext,
  ) {}

  /**
   * Execute a tool by name with the given arguments.
   * Tries command tools, then core tools, then server tools.
   *
   * @param toolName The full tool name (e.g., "github__create_issue")
   * @param args The arguments to pass to the tool
   * @returns The result of the tool execution
   */
  async executeTool(toolName: string, args: unknown): Promise<CallToolResult> {
    // 1. Try command tool execution
    const commandResult = await this.tryExecuteCommand(toolName, args);
    if (commandResult) return commandResult;

    // 2. Try core tool execution
    const coreResult = await this.tryExecuteCoreTool(toolName, args);
    if (coreResult) return coreResult;

    // 3. Try server tool execution
    return this.executeServerTool(toolName, args);
  }

  /**
   * Try to execute as a command tool.
   * Returns null if not a command tool.
   */
  private async tryExecuteCommand(
    toolName: string,
    args: unknown,
  ): Promise<CallToolResult | null> {
    const mapping = this.toolMapping.get(toolName);

    if (!mapping?.command) {
      return null;
    }

    try {
      logEvent('info', 'tool:call_dev', { name: toolName });
      const result = await mapping.command.executeToolViaMCP(
        mapping.toolName || mapping.originalName,
        args || {},
      );
      return result;
    } catch (error) {
      logError('tool:dev_execution_failed', error, { name: toolName });
      return {
        content: [
          {
            type: 'text',
            text: `Command execution failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }

  /**
   * Try to execute as a core tool.
   * Returns null if not a core tool.
   */
  private async tryExecuteCoreTool(
    toolName: string,
    args: unknown,
  ): Promise<CallToolResult | null> {
    const coreTool = this.coreTools.get(toolName);

    if (!coreTool) {
      return null;
    }

    logEvent('info', 'tool:call_core', { name: toolName });
    return coreTool.handle(
      (args ?? {}) as Record<string, unknown>,
      this.coreToolContext,
    );
  }

  /**
   * Execute as a server tool.
   * Throws if the tool is not found or execution fails.
   */
  private async executeServerTool(
    toolName: string,
    args: unknown,
  ): Promise<CallToolResult> {
    const mapping = this.toolMapping.get(toolName);

    if (!mapping) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    if (!('client' in mapping)) {
      throw new Error(`Invalid tool mapping for: ${toolName}`);
    }

    try {
      logEvent('info', 'tool:call_bridge', { name: toolName });

      if (!mapping.client) {
        throw new Error(`Tool ${toolName} has no client connection`);
      }

      const result = await mapping.client.callTool({
        name: mapping.originalName,
        arguments: args as Record<string, unknown> | undefined,
      });

      logEvent('debug', 'tool:result', { name: toolName });
      return result as CallToolResult;
    } catch (error) {
      console.error(`[proxy] Failed to call tool ${toolName}:`, error);
      logError('tool:call_failed', error, { name: toolName });
      throw error;
    }
  }
}
