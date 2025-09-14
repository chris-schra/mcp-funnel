/**
 * Command registry for discovering and managing MCP Funnel commands
 */

import type { ICommand } from './interfaces.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Registry for managing and discovering commands
 */
export class CommandRegistry {
  private commands = new Map<string, ICommand>();
  private commandTools = new Map<string, string>();

  /**
   * Register a command with the registry
   */
  register(command: ICommand): void {
    this.commands.set(command.name, command);

    // Register tool name mappings for MCP execution
    const tools = command.getMCPDefinitions();
    for (const tool of tools) {
      this.commandTools.set(tool.name, command.name);
    }
  }

  /**
   * Get a command by name for CLI execution
   */
  getCommandForCLI(name: string): ICommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Get all registered command names
   */
  getAllCommandNames(): string[] {
    return Array.from(this.commands.keys());
  }

  /**
   * Get all commands as MCP Tool definitions
   */
  getAllMCPDefinitions(): Tool[] {
    const allTools: Tool[] = [];
    for (const command of this.commands.values()) {
      allTools.push(...command.getMCPDefinitions());
    }
    return allTools;
  }

  /**
   * Get a command by name for MCP execution
   */
  getCommandForMCP(name: string): ICommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Get a command by MCP tool name for tool execution
   */
  getCommandForMCPTool(toolName: string): ICommand | undefined {
    const commandName = this.commandTools.get(toolName);
    if (!commandName) {
      return undefined;
    }
    return this.commands.get(commandName);
  }

  /**
   * Clear all registered commands
   */
  clear(): void {
    this.commands.clear();
    this.commandTools.clear();
  }

  /**
   * Get count of registered commands
   */
  size(): number {
    return this.commands.size;
  }
}
