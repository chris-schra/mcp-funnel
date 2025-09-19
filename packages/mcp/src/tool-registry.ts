import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ICommand } from '@mcp-funnel/commands-core';
import { ProxyConfig } from './config.js';
import { matchesPattern } from './utils/pattern-matcher.js';

export interface ToolState {
  // Identity
  fullName: string; // e.g., "github__create_issue"
  originalName: string; // e.g., "create_issue"
  serverName: string; // e.g., "github"

  // Discovery state
  discovered: boolean; // Tool has been discovered from source
  discoveredAt?: Date;

  // Enablement state
  enabled: boolean; // Tool is dynamically enabled
  enabledBy?: 'config' | 'discovery' | 'toolset' | 'always';
  enabledAt?: Date;

  // Visibility state (computed)
  exposed: boolean; // Tool is visible to clients
  exposureReason?: 'always' | 'enabled' | 'allowlist' | 'default' | 'core';

  // Tool data
  definition?: Tool;
  description?: string;
  client?: Client;
  command?: ICommand;
  isCoreTool?: boolean; // Core tools bypass exposeTools filtering

  // Metadata
  tags?: string[];
  category?: string;
}

export interface RegisterToolParams {
  fullName: string;
  originalName: string;
  serverName: string;
  definition: Tool;
  client?: Client;
  command?: ICommand;
  isCoreTool?: boolean; // Mark tools as core tools to bypass exposeTools filtering
}

export interface RegistryStats {
  discovered: number;
  enabled: number;
  exposed: number;
  byServer: Record<string, number>;
  byExposureReason: Record<string, number>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolState>();
  private config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  // Discovery phase - tools found but not necessarily enabled
  registerDiscoveredTool(params: RegisterToolParams): void {
    // Core tools bypass hideTools filtering
    if (!params.isCoreTool) {
      // Check if tool is hidden - if so, don't register it at all (unless alwaysVisible)
      if (this.matchesPatterns(params.fullName, this.config.hideTools)) {
        // But alwaysVisibleTools overrides hideTools
        if (
          !this.matchesPatterns(params.fullName, this.config.alwaysVisibleTools)
        ) {
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
  enableTools(toolNames: string[], source: 'discovery' | 'toolset'): void {
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
  disableTools(toolNames: string[]): void {
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
  removeToolsFromServer(serverName: string): void {
    const toolsToRemove: string[] = [];

    // Find all tools from this server
    for (const [name, tool] of this.tools) {
      if (tool.serverName === serverName) {
        toolsToRemove.push(name);
      }
    }

    // Remove them from the registry
    for (const name of toolsToRemove) {
      this.tools.delete(name);
    }

    if (toolsToRemove.length > 0) {
      console.error(
        `[registry] Removed ${toolsToRemove.length} tools from disconnected server: ${serverName}`,
      );
    }
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
    // 1. Core tools - only controlled by their own registration, not by exposeTools
    if (tool.isCoreTool) {
      return { exposed: true, reason: 'core' };
    }

    // 2. Always visible (highest priority for regular tools)
    if (this.matchesPatterns(name, this.config.alwaysVisibleTools)) {
      return { exposed: true, reason: 'always' };
    }

    // 3. Dynamically enabled
    if (tool.enabled && tool.enabledBy) {
      return { exposed: true, reason: 'enabled' };
    }

    // 4. ExposeTools allowlist mode
    if (this.config.exposeTools !== undefined) {
      const matches = this.matchesPatterns(name, this.config.exposeTools);
      return { exposed: matches, reason: matches ? 'allowlist' : undefined };
    }

    // 5. HideTools denylist
    if (this.matchesPatterns(name, this.config.hideTools)) {
      return { exposed: false };
    }

    // 6. Default visible
    return { exposed: true, reason: 'default' };
  }

  private isAutoEnabled(name: string): boolean {
    // Tools that should be enabled on discovery
    return this.matchesPatterns(name, this.config.alwaysVisibleTools);
  }

  // Query methods
  getExposedTools(): Tool[] {
    return Array.from(this.tools.values())
      .filter((t) => t.exposed && t.definition)
      .map((t) => ({
        ...t.definition!,
        name: t.fullName,
        description: `[${t.serverName}] ${t.description || ''}`,
      }));
  }

  getToolForExecution(name: string): ToolState | undefined {
    const tool = this.tools.get(name);
    return tool?.exposed ? tool : undefined;
  }

  getToolState(name: string): ToolState | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolState[] {
    return Array.from(this.tools.values());
  }

  searchTools(keywords: string[]): ToolState[] {
    // Search across ALL discovered tools (for discovery features)
    return Array.from(this.tools.values())
      .filter((t) => t.discovered)
      .filter((t) => this.matchesKeywords(t, keywords))
      .sort((a, b) => {
        // Prioritize exposed tools
        if (a.exposed !== b.exposed) return a.exposed ? -1 : 1;
        return 0;
      });
  }

  // Get tool descriptions for backward compatibility
  getToolDescriptions(): Map<
    string,
    { serverName: string; description: string }
  > {
    const descriptions = new Map<
      string,
      { serverName: string; description: string }
    >();
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
  getToolDefinitions(): Map<string, { serverName: string; tool: Tool }> {
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

  private matchesPatterns(name: string, patterns?: string[]): boolean {
    if (!patterns) return false;
    return patterns.some((p) => matchesPattern(name, p));
  }

  private matchesKeywords(tool: ToolState, keywords: string[]): boolean {
    const searchText =
      `${tool.fullName} ${tool.description} ${tool.serverName}`.toLowerCase();
    return keywords.every((kw) => searchText.includes(kw.toLowerCase()));
  }

  // State inspection
  getStats(): RegistryStats {
    const all = Array.from(this.tools.values());
    return {
      discovered: all.filter((t) => t.discovered).length,
      enabled: all.filter((t) => t.enabled).length,
      exposed: all.filter((t) => t.exposed).length,
      byServer: this.groupByServer(all),
      byExposureReason: this.groupByReason(all),
    };
  }

  private groupByServer(tools: ToolState[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const tool of tools) {
      groups[tool.serverName] = (groups[tool.serverName] || 0) + 1;
    }
    return groups;
  }

  private groupByReason(tools: ToolState[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const tool of tools.filter((t) => t.exposed)) {
      const reason = tool.exposureReason || 'unknown';
      groups[reason] = (groups[reason] || 0) + 1;
    }
    return groups;
  }

  // Export current state
  exportState() {
    return {
      tools: Array.from(this.tools.entries()).map(([name, state]) => ({
        name,
        ...state,
      })),
      stats: this.getStats(),
    };
  }
}
