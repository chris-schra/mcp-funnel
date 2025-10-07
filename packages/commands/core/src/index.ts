/**
 * Core infrastructure for MCP Funnel development tools.
 *
 * This package provides the foundational interfaces, base classes, and utilities
 * for creating commands that work seamlessly with both MCP protocol execution
 * (via AI assistants) and direct CLI execution.
 *
 * Key features:
 * - ICommand interface for dual MCP/CLI command implementations
 * - BaseCommand abstract class with common command functionality
 * - CommandRegistry for discovering and managing commands
 * - CommandInstaller for dynamic command installation from npm
 * - Discovery utilities for loading commands from filesystem and user directories
 * @example Basic usage
 * ```typescript
 * import { BaseCommand, type Tool, type CallToolResult } from '@mcp-funnel/commands-core';
 *
 * export class MyCommand extends BaseCommand {
 *   name = 'my-command';
 *   description = 'Does something useful';
 *
 *   async executeToolViaMCP(toolName: string, args: Record<string, unknown>): Promise<CallToolResult> {
 *     // MCP execution logic
 *     return { content: [{ type: 'text', text: 'Result' }] };
 *   }
 *
 *   async executeViaCLI(args: string[]): Promise<void> {
 *     // CLI execution logic
 *     console.log('Executed from CLI');
 *   }
 *
 *   getMCPDefinitions(): Tool[] {
 *     return [{
 *       name: 'my-command',
 *       description: this.description,
 *       inputSchema: { type: 'object', properties: {} }
 *     }];
 *   }
 * }
 * ```
 * @example Command discovery
 * ```typescript
 * import { discoverAllCommands } from '@mcp-funnel/commands-core';
 *
 * const registry = await discoverAllCommands('/path/to/commands', true);
 * const commandNames = registry.getAllCommandNames();
 * ```
 * @public
 * @see file:./interfaces.ts - Core interface definitions
 * @see file:./base-command.ts - Base command implementation
 * @see file:./registry.ts - Command registry
 */

// Re-export core types and interfaces
export type {
  ICommand,
  ICommandMetadata,
  ICommandOptions,
  Tool,
  CallToolResult,
} from './interfaces.js';
export { BaseCommand } from './base-command.js';
export { CommandRegistry } from './registry.js';
export { discoverCommands, discoverCommandsFromDefault, discoverAllCommands } from './discovery.js';
export { CommandInstaller } from './installer.js';
export type {
  InstalledCommand,
  CommandManifest,
  InstallOptions,
  UninstallOptions,
} from './types/index.js';
export { readManifest } from './util/index.js';
