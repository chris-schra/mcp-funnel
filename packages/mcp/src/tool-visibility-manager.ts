import { ProxyConfig } from './config.js';
import { matchesPattern } from './utils/pattern-matcher.js';

/**
 * Centralized tool visibility manager that determines whether a tool should be exposed.
 * Single source of truth for tool visibility logic.
 */
export class ToolVisibilityManager {
  /**
   * Determines if a tool should be visible based on configuration and dynamic state.
   *
   * Priority order:
   * 1. alwaysVisibleTools - Always visible regardless of other settings
   * 2. dynamicallyEnabledTools - Tools enabled at runtime via load_toolset
   * 3. exposeTools - If defined, tool must match to be visible
   * 4. hideTools - Tools matching these patterns are hidden
   * 5. Default - Visible
   *
   * @param fullToolName The full tool name (e.g., "github__create_issue")
   * @param config The proxy configuration
   * @param dynamicallyEnabledTools Set of tools enabled at runtime
   * @returns true if the tool should be visible, false otherwise
   */
  isToolVisible(
    fullToolName: string,
    config: ProxyConfig,
    dynamicallyEnabledTools: Set<string>,
  ): boolean {
    // 1. Check if always visible (highest priority)
    if (
      config.alwaysVisibleTools?.some((pattern) =>
        matchesPattern(fullToolName, pattern),
      )
    ) {
      return true;
    }

    // 2. Check if dynamically enabled
    if (dynamicallyEnabledTools.has(fullToolName)) {
      return true;
    }

    // 3. Check exposeTools (allowlist mode)
    if (config.exposeTools !== undefined) {
      // If exposeTools is defined (even as empty array), only matching tools are visible
      return config.exposeTools.some((pattern) =>
        matchesPattern(fullToolName, pattern),
      );
    }

    // 4. Check hideTools (denylist mode)
    if (
      config.hideTools?.some((pattern) => matchesPattern(fullToolName, pattern))
    ) {
      return false;
    }

    // 5. Default: visible
    return true;
  }

  /**
   * Check if a core tool should be enabled based on exposeCoreTools configuration.
   * This is separate from general tool visibility as core tools have their own config.
   *
   * @param toolName The core tool name (without prefix)
   * @param config The proxy configuration
   * @returns true if the core tool should be enabled
   */
  isCoreToolEnabled(toolName: string, config: ProxyConfig): boolean {
    // If exposeCoreTools is not specified, all core tools are enabled by default
    if (!config.exposeCoreTools) {
      return true;
    }

    // If exposeCoreTools is an empty array, no core tools are enabled
    if (config.exposeCoreTools.length === 0) {
      return false;
    }

    // Check if tool name matches any pattern in exposeCoreTools
    return config.exposeCoreTools.some((pattern) =>
      matchesPattern(toolName, pattern),
    );
  }

  /**
   * Check if a tool is explicitly hidden by hideTools configuration.
   * This is used to determine if a tool should be completely excluded from caching.
   *
   * @param fullToolName The full tool name (e.g., "github__create_issue")
   * @param config The proxy configuration
   * @returns true if the tool is explicitly hidden and should not be cached
   */
  isExplicitlyHidden(fullToolName: string, config: ProxyConfig): boolean {
    // If no hideTools configured, nothing is explicitly hidden
    if (!config.hideTools || config.hideTools.length === 0) {
      return false;
    }

    // alwaysVisibleTools overrides hideTools - these tools should still be cached
    if (
      config.alwaysVisibleTools?.some((pattern) =>
        matchesPattern(fullToolName, pattern),
      )
    ) {
      return false;
    }

    // Check if tool matches any hideTools pattern
    return config.hideTools.some((pattern) =>
      matchesPattern(fullToolName, pattern),
    );
  }
}
