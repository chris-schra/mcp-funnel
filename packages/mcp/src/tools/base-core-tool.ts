import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from './core-tool.interface.js';
import { matchesPattern } from '../utils/pattern-matcher.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

/**
 * Base class for core tools providing pattern-based enablement logic.
 *
 * Core tools are built-in tools for MCP Funnel management (discovery, loading, etc.).
 * This base class implements the standard enablement logic based on exposeCoreTools config.
 *
 * @public
 * @see {@link ICoreTool} - Core tool interface definition
 */
export abstract class BaseCoreTool implements ICoreTool {
  public abstract readonly name: string;
  public abstract readonly tool: Tool;

  /**
   * Checks if this tool should be enabled based on configuration.
   *
   * Enablement rules:
   * - If exposeCoreTools is undefined: enabled (default behavior)
   * - If exposeCoreTools is empty array: disabled
   * - If exposeCoreTools has patterns: enabled if name matches any pattern
   * @param config - Proxy configuration containing exposeCoreTools patterns
   * @returns True if tool should be enabled
   * @public
   */
  public isEnabled(config: ProxyConfig): boolean {
    // If exposeCoreTools is not specified (undefined), all core tools are enabled by default
    if (config.exposeCoreTools === undefined) {
      return true;
    }

    // If exposeCoreTools is an empty array, no core tools are enabled
    if (config.exposeCoreTools.length === 0) {
      return false;
    }

    // Check if tool name matches any pattern in exposeCoreTools
    return config.exposeCoreTools.some((pattern) => matchesPattern(this.name, pattern));
  }

  public abstract handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult>;

  public onInit?(context: CoreToolContext): void;
  public onDestroy?(): void;
}
