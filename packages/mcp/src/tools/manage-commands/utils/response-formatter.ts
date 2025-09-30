/**
 * Response formatting utilities for manage-commands tool
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { InstalledCommand } from '@mcp-funnel/commands-core';

/**
 * Generate configuration hint message for a command
 */
function generateConfigHint(commandName: string): string {
  return `For persistent mode, add to config:
- Project: ./.mcp-funnel.json
- Global: ~/.mcp-funnel.json

Add to "alwaysVisibleTools" for immediate availability:
"alwaysVisibleTools": ["${commandName}__*"]

Or add to "commands.list" for filtered loading:
"commands": { "enabled": true, "list": ["${commandName}"] }`;
}

/**
 * Format response for already installed command
 */
export function formatAlreadyInstalledResponse(
  command: InstalledCommand,
  tools: string[],
): CallToolResult {
  const toolsAvailable = tools.length > 0;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          action: 'already_installed',
          message: `Command ${command.name} is already installed`,
          command,
          tools,
          hint: toolsAvailable
            ? `Tools available: ${tools.join(', ')}\n\n📝 Already installed - choose mode:\n1. Session-only: Use discovery as needed\n2. Persistent: Add to config for auto-loading\n\nFor persistent mode in .mcp-funnel.json:\n"alwaysVisibleTools": ["${command.name}__*"] or\n"commands": { "list": ["${command.name}"] }`
            : `Command installed but not loaded. Use 'discover_tools_by_words' with "${command.name}" to enable.\n\n📝 To auto-load on startup, add to .mcp-funnel.json:\n"alwaysVisibleTools": ["${command.name}__*"] or\n"commands": { "list": ["${command.name}"] }`,
        }),
      },
    ],
  };
}

/**
 * Format response for newly installed command
 */
export function formatInstallResponse(
  command: InstalledCommand,
  discoveredTools: string[],
  hotReloaded: boolean,
  hotReloadError?: string,
): CallToolResult {
  const toolsMessage =
    discoveredTools.length > 0
      ? `Available tools: ${discoveredTools.join(', ')}`
      : '';

  const hint = hotReloaded
    ? `Command installed and hot-reloaded! ${toolsMessage || 'Tools are now available for use.'}\n\n📝 Installation Modes:\n1. Session-only: Tools are available now via discovery\n2. Persistent: Add to .mcp-funnel.json for automatic loading\n\n${generateConfigHint(command.name)}`
    : `Command installed! Session-only mode - use 'discover_tools_by_words' with "${command.name}" to enable.\n\n📝 Installation Modes:\n1. Session-only: Use discovery to enable when needed\n2. Persistent: Add to .mcp-funnel.json for automatic loading\n\n${generateConfigHint(command.name)}`;

  const response: Record<string, unknown> = {
    success: true,
    action: 'installed',
    message: `Successfully installed command: ${command.name}`,
    command,
    hint,
    tools: discoveredTools,
  };

  if (hotReloadError) {
    response.hotReloadError = hotReloadError;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response),
      },
    ],
  };
}

/**
 * Format response for uninstalled command
 */
export function formatUninstallResponse(packageSpec: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          action: 'uninstalled',
          message: `Successfully uninstalled command: ${packageSpec}`,
          note: 'Tools will be removed when the session restarts',
        }),
      },
    ],
  };
}

/**
 * Format response for updated command
 */
export function formatUpdateResponse(
  command: InstalledCommand,
  hotReloaded: boolean,
  hotReloadError?: string,
): CallToolResult {
  const response: Record<string, unknown> = {
    success: true,
    action: 'updated',
    message: `Successfully updated command: ${command.name} to version ${command.version}`,
    command,
    hotReloaded,
    hint: `Command updated! ${hotReloaded ? 'Tools reloaded.' : 'Restart session to load updated tools.'}\n\n📝 For persistent mode, ensure it's in .mcp-funnel.json:\n"alwaysVisibleTools": ["${command.name}__*"] or\n"commands": { "list": ["${command.name}"] }`,
  };

  if (hotReloadError) {
    response.hotReloadError = hotReloadError;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response),
      },
    ],
  };
}

/**
 * Format error response
 */
export function formatErrorResponse(error: unknown): CallToolResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: errorMessage,
        }),
      },
    ],
  };
}

/**
 * Format unknown action error response
 */
export function formatUnknownActionResponse(action: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: `Unknown action: ${action}`,
        }),
      },
    ],
  };
}
