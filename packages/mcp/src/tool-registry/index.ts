import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ICommand } from '@mcp-funnel/commands-core';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import type { RegisterToolParams, RegistryStats, ToolState } from './types.js';
import { ToolRegistryUtils } from './utils.js';
export type { ToolState } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolState>();
  private config: ProxyConfig;

  public constructor(config: ProxyConfig) {
    this.config = config;
  }

  // Discovery phase - tools found but not necessarily enabled
  public registerDiscoveredTool(params: RegisterToolParams): void {
    // Core tools bypass hideTools filtering
    if (!params.isCoreTool) {
      // Check if tool is hidden - if so, don't register it at all (unless alwaysVisible)
      if (ToolRegistryUtils.matchesPatterns(params.fullName, this.config.hideTools)) {
        // But alwaysVisibleTools overrides hideTools
        if (!ToolRegistryUtils.matchesPatterns(params.fullName, this.config.alwaysVisibleTools)) {
          // Tool is hidden and not alwaysVisible, act as a firewall - don't register it
          return;
        }
      }
    }

    const existing = this.tools.get(params.fullName);

    this.tools.set(params.fullName, {
      ...existing,
      ...params,
      discovered: true,
      discoveredAt: new Date(),
      description: params.definition.description,
      enabled: existing?.enabled ?? this.isAutoEnabled(params.fullName),
      exposed: false, // Will compute later
    });

    this.updateExposureState(params.fullName);
  }

  // Enable tools dynamically
  public enableTools(toolNames: string[], source: 'discovery' | 'toolset'): void {
    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (tool) {
        tool.enabled = true;
        tool.enabledBy = source;
        tool.enabledAt = new Date();
        this.updateExposureState(name);
      }
    }
  }

  // Disable tools
  public disableTools(toolNames: string[]): void {
    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (tool && tool.enabledBy !== 'always') {
        tool.enabled = false;
        tool.enabledBy = undefined;
        tool.enabledAt = undefined;
        this.updateExposureState(name);
      }
    }
  }

  // Remove all tools from a specific server (used for server disconnection)
  public removeToolsFromServer(serverName: string): void {
    const toolsToRemove: string[] = [];

    // Find all tools from this server
    for (const [name, tool] of this.tools) {
      if (tool.serverName === serverName) {
        toolsToRemove.push(name);
      }
    }

    // Remove them from the registry
    for (const toolName of toolsToRemove) {
      this.tools.delete(toolName);
    }

    if (toolsToRemove.length > 0) {
      console.error(
        `[registry] Removed ${toolsToRemove.length} tools from disconnected server: ${serverName}`,
      );
    }
  }

  // Hot-reload a command's tools (for dynamic command installation)
  public hotReloadCommand(command: ICommand): void {
    // Remove existing tools from this command
    const toolsToRemove: string[] = [];
    for (const [name, tool] of this.tools) {
      if (tool.command?.name === command.name) {
        toolsToRemove.push(name);
      }
    }
    for (const toolName of toolsToRemove) {
      this.tools.delete(toolName);
    }

    // Register new tools from the command
    const mcpDefs = command.getMCPDefinitions();
    const isSingle = mcpDefs.length === 1;
    const singleMatchesCommand = isSingle && mcpDefs[0]?.name === command.name;

    for (const mcpDef of mcpDefs) {
      const useCompact = singleMatchesCommand && mcpDef.name === command.name;
      const displayName = useCompact ? `${command.name}` : `${command.name}_${mcpDef.name}`;

      if (!mcpDef.description) {
        throw new Error(
          `Tool ${mcpDef.name} from command ${command.name} is missing a description`,
        );
      }

      this.registerDiscoveredTool({
        fullName: displayName,
        originalName: mcpDef.name,
        serverName: 'commands',
        definition: { ...mcpDef, name: displayName },
        command,
      });
    }

    console.info(`[registry] Hot-reloaded command '${command.name}' with ${mcpDefs.length} tools`);
  }

  // Compatibility alias for older callers
  public removeServerTools(serverName: string): void {
    this.removeToolsFromServer(serverName);
  }

  // Compute if tool should be exposed (visible to clients)
  private updateExposureState(toolName: string): void {
    const tool = this.tools.get(toolName);
    if (!tool) return;

    // Priority-based visibility rules
    const result = this.computeVisibility(toolName, tool);
    tool.exposed = result.exposed;
    tool.exposureReason = result.reason;
  }

  private computeVisibility(
    name: string,
    tool: ToolState,
  ): {
    exposed: boolean;
    reason?: 'always' | 'enabled' | 'allowlist' | 'default' | 'core';
  } {
    return ToolRegistryUtils.computeVisibility(this.config, name, tool);
  }

  private isAutoEnabled(name: string): boolean {
    // Tools that should be enabled on discovery
    return ToolRegistryUtils.matchesPatterns(name, this.config.alwaysVisibleTools);
  }

  // Query methods
  public getExposedTools(): Tool[] {
    return Array.from(this.tools.values())
      .filter((t) => t.exposed && t.definition)
      .map((t) => ({
        ...t.definition!,
        name: t.fullName,
        description: `[${t.serverName}] ${t.description || ''}`,
      }));
  }

  public getToolForExecution(name: string): ToolState | undefined {
    const tool = this.tools.get(name);
    return tool?.exposed ? tool : undefined;
  }

  public getToolState(name: string): ToolState | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): ToolState[] {
    return Array.from(this.tools.values());
  }

  public searchTools(keywords: string[], mode: 'and' | 'or' = 'and'): ToolState[] {
    return ToolRegistryUtils.searchTools(Array.from(this.tools.values()), keywords, mode);
  }

  // Get tool descriptions for backward compatibility
  public getToolDescriptions(): Map<string, { serverName: string; description: string }> {
    const descriptions = new Map<string, { serverName: string; description: string }>();
    for (const [name, tool] of this.tools) {
      if (tool.discovered) {
        descriptions.set(name, {
          serverName: tool.serverName,
          description: tool.description || '',
        });
      }
    }
    return descriptions;
  }

  // Get tool definitions for backward compatibility
  public getToolDefinitions(): Map<string, { serverName: string; tool: Tool }> {
    const definitions = new Map<string, { serverName: string; tool: Tool }>();
    for (const [name, toolState] of this.tools) {
      if (toolState.definition) {
        definitions.set(name, {
          serverName: toolState.serverName,
          tool: toolState.definition,
        });
      }
    }
    return definitions;
  }

  // State inspection
  public getStats(): RegistryStats {
    return ToolRegistryUtils.getStats(Array.from(this.tools.values()));
  }

  // Export current state
  public exportState() {
    return {
      tools: Array.from(this.tools.entries()).map(([name, state]) => ({
        name,
        ...state,
      })),
      stats: this.getStats(),
    };
  }
}
