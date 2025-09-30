import type { ToolState } from './types.js';
import { matchesPattern } from '../utils/pattern-matcher.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

function groupByServer(tools: ToolState[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const tool of tools) {
    groups[tool.serverName] = (groups[tool.serverName] || 0) + 1;
  }
  return groups;
}

function groupByReason(tools: ToolState[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const tool of tools.filter((t) => t.exposed)) {
    const reason = tool.exposureReason || 'unknown';
    groups[reason] = (groups[reason] || 0) + 1;
  }
  return groups;
}

function getStats(tools: ToolState[]) {
  return {
    discovered: tools.filter((t) => t.discovered).length,
    enabled: tools.filter((t) => t.enabled).length,
    exposed: tools.filter((t) => t.exposed).length,
    byServer: ToolRegistryUtils.groupByServer(tools),
    byExposureReason: ToolRegistryUtils.groupByReason(tools),
  };
}

function matchesKeywords(
  tool: ToolState,
  keywords: string[],
  mode: 'and' | 'or' = 'and',
): boolean {
  const searchText =
    `${tool.fullName} ${tool.description} ${tool.serverName}`.toLowerCase();

  if (mode === 'or') {
    // OR logic: tool must contain at least one keyword
    return keywords.some((kw) => searchText.includes(kw.toLowerCase()));
  } else {
    // AND logic: tool must contain all keywords
    return keywords.every((kw) => searchText.includes(kw.toLowerCase()));
  }
}

function searchTools(
  tools: ToolState[],
  keywords: string[],
  mode: 'and' | 'or' = 'and',
) {
  return tools
    .filter((t) => t.discovered)
    .filter((t) => ToolRegistryUtils.matchesKeywords(t, keywords, mode))
    .sort((a, b) => {
      // Prioritize exposed tools
      if (a.exposed !== b.exposed) return a.exposed ? -1 : 1;
      return 0;
    });
}

function matchesPatterns(name: string, patterns?: string[]): boolean {
  if (!patterns) return false;
  return patterns.some((p) => matchesPattern(name, p));
}

function computeVisibility(
  config: ProxyConfig,
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
export const ToolRegistryUtils = {
  groupByServer,
  groupByReason,
  getStats,
  matchesKeywords,
  searchTools,
  matchesPatterns,
  computeVisibility,
};
