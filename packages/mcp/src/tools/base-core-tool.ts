import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from './core-tool.interface.js';
import { matchesPattern } from '../utils/pattern-matcher.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

/**
 * Base class for core tools that provides common pattern matching functionality
 */
export abstract class BaseCoreTool implements ICoreTool {
  public abstract readonly name: string;
  public abstract readonly tool: Tool;

  /**
   * Check if this tool should be enabled based on config
   * Uses pattern matching against exposeCoreTools if specified
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
    return config.exposeCoreTools.some((pattern) =>
      matchesPattern(this.name, pattern),
    );
  }

  public abstract handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult>;

  public onInit?(context: CoreToolContext): void;
  public onDestroy?(): void;
}
