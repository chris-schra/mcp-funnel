/**
 * Hot-reload utilities for manage-commands tool.
 *
 * Provides functions to hot-reload installed commands without restarting the session.
 * @public
 */

import type { CommandInstaller } from '@mcp-funnel/commands-core';
import type { CoreToolContext } from '../../core-tool.interface.js';

/**
 * Result of a hot-reload operation.
 * @public
 */
export interface HotReloadResult {
  /** Whether hot-reload was successful */
  hotReloaded: boolean;
  /** Array of tool names discovered from the command */
  tools: string[];
  /** Error message if hot-reload failed */
  hotReloadError?: string;
}

/**
 * Attempts to hot-reload a command and discover its tools.
 *
 * Loads the command package, registers it with the tool registry, and returns
 * the list of tools it provides. Used after install/update to make tools available
 * without restarting the session.
 * @param installer - Command installer instance
 * @param commandPackage - Package name/spec to load
 * @param commandName - Command name for filtering tools
 * @param context - Core tool context with registry access
 * @returns Hot-reload result with status and tools
 * @public
 */
export async function hotReloadCommand(
  installer: CommandInstaller,
  commandPackage: string,
  commandName: string,
  context: CoreToolContext,
): Promise<HotReloadResult> {
  let hotReloaded = false;
  let hotReloadError: string | undefined;
  let tools: string[] = [];

  try {
    // Use the installer's loadInstalledCommand which properly resolves entry points
    const command = await installer.loadInstalledCommand(commandPackage);
    if (!command) {
      hotReloadError = `Package '${commandPackage}' does not export a valid MCP Funnel command`;
    } else if (context.toolRegistry?.hotReloadCommand) {
      context.toolRegistry.hotReloadCommand(command);
      hotReloaded = true;

      // Get tools after hot-reload
      const allTools = context.toolRegistry.getAllTools();
      tools = allTools
        .filter((tool) => tool.command?.name === commandName && tool.discovered)
        .map((tool) => tool.fullName);
    }
  } catch (error) {
    hotReloadError = error instanceof Error ? error.message : String(error);
    console.error('Hot-reload failed for command:', commandPackage, error);
  }

  return { hotReloaded, tools, hotReloadError };
}

/**
 * Gets tools for an existing command from the tool registry.
 *
 * Queries the tool registry for all discovered tools belonging to the specified command.
 * @param commandName - Command name to filter tools
 * @param context - Core tool context with registry access
 * @returns Array of tool full names for the command
 * @public
 */
export function getExistingTools(commandName: string, context: CoreToolContext): string[] {
  if (!context.toolRegistry) {
    return [];
  }

  const allTools = context.toolRegistry.getAllTools();
  return allTools
    .filter((tool) => tool.command?.name === commandName && tool.discovered)
    .map((tool) => tool.fullName);
}
