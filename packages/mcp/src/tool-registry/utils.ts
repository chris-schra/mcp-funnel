import type { ToolState, VisibilityResult } from './types.js';
import { matchesPattern } from '../utils/pattern-matcher.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

/**
 * Groups tools by server name and counts tools per server.
 * @param tools - Array of tool states to group
 * @returns Object mapping server names to tool counts
 * @internal
 */
function groupByServer(tools: ToolState[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const tool of tools) {
    groups[tool.serverName] = (groups[tool.serverName] || 0) + 1;
  }
  return groups;
}

/**
 * Groups exposed tools by their exposure reason and counts each category.
 * @param tools - Array of tool states to analyze
 * @returns Object mapping exposure reasons to counts
 * @internal
 */
function groupByReason(tools: ToolState[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const tool of tools.filter((t) => t.exposed)) {
    const reason = tool.exposureReason || 'unknown';
    groups[reason] = (groups[reason] || 0) + 1;
  }
  return groups;
}

/**
 * Generates comprehensive statistics about tool states.
 * @param tools - Array of tool states to analyze
 * @returns Statistics object with counts by status, server, and exposure reason
 * @internal
 */
function getStats(tools: ToolState[]) {
  return {
    discovered: tools.filter((t) => t.discovered).length,
    enabled: tools.filter((t) => t.enabled).length,
    exposed: tools.filter((t) => t.exposed).length,
    byServer: ToolRegistryUtils.groupByServer(tools),
    byExposureReason: ToolRegistryUtils.groupByReason(tools),
  };
}

/**
 * Checks if a tool matches search keywords using AND or OR logic.
 *
 * Searches across tool fullName, description, and serverName (case-insensitive).
 * - AND mode: Tool must contain ALL keywords
 * - OR mode: Tool must contain at least ONE keyword
 * @param tool - Tool state to check
 * @param keywords - Array of search keywords (already lowercased)
 * @param mode - Search logic mode (default 'and')
 * @returns True if tool matches keyword criteria
 * @internal
 */
function matchesKeywords(tool: ToolState, keywords: string[], mode: 'and' | 'or' = 'and'): boolean {
  const searchText = `${tool.fullName} ${tool.description} ${tool.serverName}`.toLowerCase();

  if (mode === 'or') {
    // OR logic: tool must contain at least one keyword
    return keywords.some((kw) => searchText.includes(kw.toLowerCase()));
  } else {
    // AND logic: tool must contain all keywords
    return keywords.every((kw) => searchText.includes(kw.toLowerCase()));
  }
}

/**
 * Searches discovered tools by keywords and returns matches sorted by exposure status.
 *
 * Only searches tools that have been discovered. Results prioritize exposed tools.
 * @param tools - Array of tool states to search
 * @param keywords - Array of search keywords
 * @param mode - Search logic mode (default 'and')
 * @returns Array of matching tools sorted by exposure status
 * @internal
 */
function searchTools(tools: ToolState[], keywords: string[], mode: 'and' | 'or' = 'and') {
  return tools
    .filter((t) => t.discovered)
    .filter((t) => ToolRegistryUtils.matchesKeywords(t, keywords, mode))
    .sort((a, b) => {
      // Prioritize exposed tools
      if (a.exposed !== b.exposed) return a.exposed ? -1 : 1;
      return 0;
    });
}

/**
 * Checks if a tool name matches any of the given glob patterns.
 * @param name - Tool name to check
 * @param patterns - Optional array of glob patterns
 * @returns True if name matches any pattern, false if no patterns provided
 * @internal
 */
function matchesPatterns(name: string, patterns?: string[]): boolean {
  if (!patterns) return false;
  return patterns.some((p) => matchesPattern(name, p));
}

/**
 * Computes tool visibility based on configuration rules and tool state.
 *
 * Visibility is determined by priority order:
 * 1. Core tools - always exposed regardless of config
 * 2. alwaysVisibleTools - highest priority for regular tools
 * 3. Dynamically enabled tools - enabled via discovery
 * 4. exposeTools allowlist - if configured, only matched tools exposed
 * 5. hideTools denylist - explicitly hidden tools
 * 6. Default visible - all other tools visible by default
 *
 * @param config - Proxy configuration with visibility rules
 * @param name - Tool name to check
 * @param tool - Tool state with metadata
 * @returns Object with exposed boolean and optional reason
 *
 * @internal
 */
function computeVisibility(config: ProxyConfig, name: string, tool: ToolState): VisibilityResult {
  // 1. Core tools - only controlled by their own registration, not by exposeTools
  if (tool.isCoreTool) {
    return { exposed: true, reason: 'core' };
  }

  // 2. Always visible (highest priority for regular tools)
  if (ToolRegistryUtils.matchesPatterns(name, config.alwaysVisibleTools)) {
    return { exposed: true, reason: 'always' };
  }

  // 3. Dynamically enabled
  if (tool.enabled && tool.enabledBy) {
    return { exposed: true, reason: 'enabled' };
  }

  // 4. ExposeTools allowlist mode
  if (config.exposeTools !== undefined) {
    const matches = ToolRegistryUtils.matchesPatterns(name, config.exposeTools);
    return { exposed: matches, reason: matches ? 'allowlist' : undefined };
  }

  // 5. HideTools denylist
  if (ToolRegistryUtils.matchesPatterns(name, config.hideTools)) {
    return { exposed: false };
  }

  // 6. Default visible
  return { exposed: true, reason: 'default' };
}

/**
 * Utility functions for tool registry operations.
 *
 * Provides functions for tool search, grouping, statistics, and visibility computation.
 * All functions are internal utilities used by ToolRegistry.
 *
 * @internal
 * @see {@link ToolRegistry} - Main registry class using these utilities
 */
export const ToolRegistryUtils = {
  groupByServer,
  groupByReason,
  getStats,
  matchesKeywords,
  searchTools,
  matchesPatterns,
  computeVisibility,
};
