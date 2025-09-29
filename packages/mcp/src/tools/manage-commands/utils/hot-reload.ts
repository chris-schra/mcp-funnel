/**
 * Hot-reload utilities for manage-commands tool
 */

import type { CommandInstaller } from '@mcp-funnel/commands-core';
import type { CoreToolContext } from '../../core-tool.interface.js';

export interface HotReloadResult {
  hotReloaded: boolean;
  tools: string[];
  hotReloadError?: string;
}

/**
 * Attempt to hot-reload a command and return its tools
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
 * Get tools for an existing command from the tool registry
 */
export function getExistingTools(
  commandName: string,
  context: CoreToolContext,
): string[] {
  if (!context.toolRegistry) {
    return [];
  }

  const allTools = context.toolRegistry.getAllTools();
  return allTools
    .filter((tool) => tool.command?.name === commandName && tool.discovered)
    .map((tool) => tool.fullName);
}
