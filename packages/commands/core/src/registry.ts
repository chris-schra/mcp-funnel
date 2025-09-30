/**
 * Command registry for discovering and managing MCP Funnel commands.
 *
 * Provides a central registry for command instances that implement the ICommand interface.
 * Commands can be registered, retrieved for CLI or MCP execution, and converted to
 * MCP tool definitions for protocol integration.
 * @example
 * ```typescript
 * import { CommandRegistry } from '@mcp-funnel/commands-core';
 *
 * const registry = new CommandRegistry();
 * registry.register(myCommand);
 * const cmd = registry.getCommandForCLI('my-command');
 * await cmd?.executeViaCLI(['--help']);
 * ```
 * @public
 * @see file:./interfaces.ts:8 - ICommand interface definition
 * @see file:./discovery.ts - Command discovery utilities
 */

import type { ICommand } from './interfaces.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Registry for managing and discovering commands.
 *
 * Maintains a map of command names to ICommand instances, providing
 * methods for registration, retrieval, and introspection. Used throughout
 * the system to manage both bundled and dynamically loaded commands.
 * @public
 */
export class CommandRegistry {
  private commands = new Map<string, ICommand>();

  /**
   * Registers a command with the registry.
   *
   * Adds the command to the internal map keyed by command name. If a command
   * with the same name already exists, it will be replaced.
   * @param command - Command instance implementing the ICommand interface
   * @example
   * ```typescript
   * const registry = new CommandRegistry();
   * registry.register(myCustomCommand);
   * ```
   */
  public register(command: ICommand): void {
    this.commands.set(command.name, command);
  }

  /**
   * Retrieves a command by name for CLI execution.
   * @param name - Command name to retrieve
   * @returns Command instance if found, undefined otherwise
   * @example
   * ```typescript
   * const cmd = registry.getCommandForCLI('js-debugger');
   * if (cmd) {
   *   await cmd.executeViaCLI(['--version']);
   * }
   * ```
   */
  public getCommandForCLI(name: string): ICommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Returns all registered command names.
   *
   * Useful for listing available commands or iterating through the registry.
   * @returns Array of command names currently registered
   * @example
   * ```typescript
   * const names = registry.getAllCommandNames();
   * console.log(`Available commands: ${names.join(', ')}`);
   * ```
   */
  public getAllCommandNames(): string[] {
    return Array.from(this.commands.keys());
  }

  /**
   * Retrieves all MCP Tool definitions from registered commands.
   *
   * Aggregates tool definitions from all registered commands by calling
   * getMCPDefinitions() on each command and flattening the results into
   * a single array. Each command may expose multiple tools.
   * @returns Array of MCP Tool definitions from all registered commands
   * @example
   * ```typescript
   * const tools = registry.getAllMCPDefinitions();
   * console.log(`Total tools: ${tools.length}`);
   * for (const tool of tools) {
   *   console.log(`- ${tool.name}: ${tool.description}`);
   * }
   * ```
   * @see file:./interfaces.ts:40 - ICommand.getMCPDefinitions method
   */
  public getAllMCPDefinitions(): Tool[] {
    return Array.from(this.commands.values()).flatMap((command) =>
      command.getMCPDefinitions(),
    );
  }

  /**
   * Retrieves a command by name for MCP execution.
   *
   * Functionally identical to getCommandForCLI() but provides semantic clarity
   * for code that intends to execute commands via the MCP protocol.
   * @param name - Command name to retrieve
   * @returns Command instance if found, undefined otherwise
   * @example
   * ```typescript
   * const cmd = registry.getCommandForMCP('js-debugger');
   * if (cmd) {
   *   const result = await cmd.executeToolViaMCP('debug', { target: 'app.js' });
   * }
   * ```
   */
  public getCommandForMCP(name: string): ICommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Removes all registered commands from the registry.
   *
   * Clears the internal command map, leaving the registry empty.
   * Useful for testing or when rebuilding the registry from scratch.
   * @example
   * ```typescript
   * registry.clear();
   * console.log(registry.size()); // Output: 0
   * ```
   */
  public clear(): void {
    this.commands.clear();
  }

  /**
   * Returns the number of commands currently registered.
   * @returns Count of registered commands
   * @example
   * ```typescript
   * const count = registry.size();
   * console.log(`Registry contains ${count} commands`);
   * ```
   */
  public size(): number {
    return this.commands.size;
  }
}
