import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Notification } from '@modelcontextprotocol/sdk/types.js';
import type { CoreToolContext } from '../../tools/core-tool.interface.js';
import type { ToolRegistry } from '../../tool-registry/index.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

/**
 * Creates a tool context for core tools with registry and notification support.
 *
 * Provides core tools with access to tool registry, configuration, and the ability
 * to enable tools dynamically and send notifications to the MCP client.
 * @param toolRegistry - Registry for tool management and discovery
 * @param config - Proxy configuration including tool visibility rules
 * @param configPath - Path to configuration file
 * @param server - MCP server instance for sending notifications
 * @returns CoreToolContext for use by core tools
 * @public
 * @see file:../../tools/core-tool.interface.ts - CoreToolContext interface
 */
export function createToolContext(
  toolRegistry: ToolRegistry,
  config: ProxyConfig,
  configPath: string,
  server: Server,
): CoreToolContext {
  return {
    toolRegistry,
    // Backward compatibility - provide the caches from registry
    toolDescriptionCache: toolRegistry.getToolDescriptions(),
    toolDefinitionCache: toolRegistry.getToolDefinitions(),
    dynamicallyEnabledTools: new Set(
      toolRegistry
        .getAllTools()
        .filter((t) => t.enabled && t.enabledBy)
        .map((t) => t.fullName),
    ),
    config,
    configPath,
    enableTools: (toolNames: string[]) => {
      toolRegistry.enableTools(toolNames, 'discovery');
      for (const toolName of toolNames) {
        console.error(`[proxy] Dynamically enabled tool: ${toolName}`);
      }
      // Send notification that the tool list has changed
      server.sendToolListChanged();
      console.error(`[proxy] Sent tools/list_changed notification`);
    },
    sendNotification: async (
      method: string,
      params?: Record<string, unknown>,
    ) => {
      try {
        // Create a properly typed notification object that conforms to the Notification interface
        const notification: Notification = {
          method,
          ...(params !== undefined && { params }),
        };
        // Type assertion is required because the Server class restricts notifications to specific types,
        // but this function needs to support arbitrary custom notifications
        // Await the notification to properly catch async errors
        await server.notification(notification as Notification);
      } catch (error) {
        // Server might not be connected in tests - log but don't throw
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[proxy] Failed to send ${method} notification: ${errorMessage}`,
        );
      }
    },
  };
}
