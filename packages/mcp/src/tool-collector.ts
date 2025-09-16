import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ICoreTool } from './tools/core-tool.interface.js';
import { ProxyConfig } from './config.js';
import { ToolVisibilityManager } from './tool-visibility-manager.js';
import { logEvent, logError } from './logger.js';
import { ICommand } from '@mcp-funnel/commands-core';

export interface ToolDefinition {
  serverName: string;
  tool: Tool;
}

export interface ToolMapping {
  client: Client | null;
  originalName: string;
  toolName?: string;
  command?: ICommand; // ICommand type
}

/**
 * Collects tools from various sources and manages tool caching.
 * Separates the concern of gathering tools from visibility filtering.
 */
export class ToolCollector {
  private toolDescriptionCache: Map<
    string,
    { serverName: string; description: string }
  >;
  private toolDefinitionCache: Map<string, ToolDefinition>;
  private toolMapping: Map<string, ToolMapping>;
  private visibilityManager: ToolVisibilityManager;

  constructor(
    private config: ProxyConfig,
    private coreTools: Map<string, ICoreTool>,
    private clients: Map<string, Client>,
    private dynamicallyEnabledTools: Set<string>,
  ) {
    this.toolDescriptionCache = new Map();
    this.toolDefinitionCache = new Map();
    this.toolMapping = new Map();
    this.visibilityManager = new ToolVisibilityManager();
  }

  /**
   * Get references to the caches for external use
   */
  getCaches() {
    return {
      toolDescriptionCache: this.toolDescriptionCache,
      toolDefinitionCache: this.toolDefinitionCache,
      toolMapping: this.toolMapping,
    };
  }

  /**
   * Collect all visible tools from all sources.
   * This is the main entry point for gathering tools.
   */
  async collectVisibleTools(): Promise<Tool[]> {
    const allTools: Tool[] = [];

    // 1. Collect core tools
    allTools.push(...this.collectCoreTools());

    // 2. Collect server tools
    for (const [serverName, client] of this.clients) {
      const serverTools = await this.collectServerTools(serverName, client);
      allTools.push(...serverTools);
    }

    // 3. Collect command tools
    allTools.push(...this.collectCommandTools());

    logEvent('debug', 'tools:list_complete', { total: allTools.length });
    return allTools;
  }

  /**
   * Collect core tools that are enabled and visible.
   */
  private collectCoreTools(): Tool[] {
    const visibleCoreTools: Tool[] = [];

    for (const coreTool of this.coreTools.values()) {
      // Core tools are ONLY controlled by exposeCoreTools config
      // They don't go through the general visibility check (exposeTools/hideTools)
      if (
        this.visibilityManager.isCoreToolEnabled(coreTool.name, this.config)
      ) {
        visibleCoreTools.push(coreTool.tool);
      }
    }

    return visibleCoreTools;
  }

  /**
   * Collect tools from a specific server.
   * Caches all tools but only returns visible ones.
   */
  private async collectServerTools(
    serverName: string,
    client: Client,
  ): Promise<Tool[]> {
    const visibleTools: Tool[] = [];

    try {
      const response = await client.listTools();

      for (const tool of response.tools) {
        const fullToolName = `${serverName}__${tool.name}`;

        // Check if tool is explicitly hidden - if so, don't cache it at all
        if (
          this.visibilityManager.isExplicitlyHidden(fullToolName, this.config)
        ) {
          // Skip this tool entirely - no caching, no visibility
          continue;
        }

        // Cache tool information for discovery and bridge_tool_request
        // (only for non-hidden tools)
        this.cacheToolInfo(serverName, tool, client);

        // Check visibility for listing
        if (
          this.visibilityManager.isToolVisible(
            fullToolName,
            this.config,
            this.dynamicallyEnabledTools,
          )
        ) {
          visibleTools.push({
            ...tool,
            name: fullToolName,
            description: `[${serverName}] ${tool.description || ''}`,
          });
        }
      }
    } catch (error) {
      console.error(`[proxy] Failed to list tools from ${serverName}:`, error);
      logError('tools:list_failed', error, { server: serverName });
    }

    return visibleTools;
  }

  /**
   * Cache tool information for later use by discovery and execution.
   */
  private cacheToolInfo(serverName: string, tool: Tool, client: Client): void {
    const fullToolName = `${serverName}__${tool.name}`;

    // Cache description for discovery
    this.toolDescriptionCache.set(fullToolName, {
      serverName,
      description: tool.description || '',
    });

    // Cache definition for later use
    this.toolDefinitionCache.set(fullToolName, {
      serverName,
      tool,
    });

    // Register in toolMapping for execution
    // Note: Only non-hidden tools reach this point
    this.toolMapping.set(fullToolName, {
      client,
      originalName: tool.name,
    });
  }

  /**
   * Collect command tools from the definition cache.
   */
  private collectCommandTools(): Tool[] {
    const visibleTools: Tool[] = [];

    for (const [toolName, definition] of this.toolDefinitionCache) {
      if (definition.serverName === 'commands') {
        // The toolName is already the full display name (e.g., "npm_lookup" or just "validate")
        // Check visibility with the actual tool name as stored
        if (
          this.visibilityManager.isToolVisible(
            toolName,
            this.config,
            this.dynamicallyEnabledTools,
          )
        ) {
          visibleTools.push(definition.tool);
        }
      }
    }

    return visibleTools;
  }

  /**
   * Update the tool mapping for a specific tool.
   * Used when registering command tools.
   */
  updateToolMapping(toolName: string, mapping: ToolMapping): void {
    this.toolMapping.set(toolName, mapping);
  }

  /**
   * Add a tool definition to the cache.
   * Used when registering command tools.
   */
  addToolDefinition(toolName: string, definition: ToolDefinition): void {
    this.toolDefinitionCache.set(toolName, definition);
  }
}
