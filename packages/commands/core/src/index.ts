/**
 * @mcp-funnel/commands-core
 *
 * Core infrastructure for MCP Funnel development tools.
 * Provides base interfaces, registry, and utilities for creating
 * tools that work with both MCP protocol and CLI execution.
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
export { discoverCommands, discoverCommandsFromDefault } from './discovery.js';
