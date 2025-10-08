import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { RegistryContext } from '../../mcp-registry/index.js';

export interface ToolMatch {
  fullName: string;
  originalName: string;
  serverName: string;
  description?: string;
  exposed: boolean;
  enabled: boolean;
  definition?: Tool;
}

interface ParsedWordsParameter {
  keywords: string[];
  searchMode: 'and' | 'or';
}

/**
 * Core tool for discovering and dynamically enabling MCP tools via keyword search.
 *
 * Searches across tool names, descriptions, and server names using AND/OR logic.
 * Optionally enables discovered tools in a single operation. Supports both string
 * and structured search parameters for flexible querying.
 * @public
 * @see file:../core-tool.interface.ts - Core tool interface
 * @see file:../../tool-registry/utils.ts:83 - Search implementation
 */
export class DiscoverToolsByWords extends BaseCoreTool {
  public readonly name = 'discover_tools_by_words';

  public get tool(): Tool {
    return {
      name: this.name,
      description:
        "Search for tools by keywords in their descriptions. IMPORTANT: Use minimal, specific keywords that directly match the user's intent. Each keyword will match ANY tool containing that word - avoid generic terms (github, file, memory) unless the user explicitly mentions them. When enable=true, carefully review the number of matched tools before activation as each tool increases context usage.",
      inputSchema: {
        type: 'object',
        properties: {
          words: {
            oneOf: [
              {
                type: 'string',
                description:
                  'Space-separated keywords (uses AND logic - tool must contain ALL keywords)',
              },
              {
                type: 'object',
                properties: {
                  and: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tool must contain ALL of these keywords',
                  },
                },
                required: ['and'],
              },
              {
                type: 'object',
                properties: {
                  or: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tool must contain ANY of these keywords',
                  },
                },
                required: ['or'],
              },
            ],
            description:
              'Search keywords - either a string (AND logic), or an object with "and" array (ALL keywords) or "or" array (ANY keyword)',
          },
          enable: {
            type: 'boolean',
            description:
              'If true, automatically enable ALL discovered tools. WARNING: This increases context usage. Consider discovering first (enable=false), reviewing results, then using load_toolset to enable specific tools if many matches are found.',
            default: false,
          },
        },
        required: ['words'],
      },
    };
  }

  public constructor() {
    super();
  }

  /**
   * Truncates description for display in search results.
   *
   * Truncation strategy:
   * - Under 100 chars: return as-is
   * - Over 100 chars: truncate at first line break after 100 chars
   * - No line break: truncate at 200 chars with ellipsis
   * @param description - Tool description to truncate
   * @returns Truncated description
   * @internal
   */
  private truncateDescription(description: string | undefined): string {
    if (!description) return '';

    // If short enough, return as-is
    if (description.length <= 100) return description;

    // Find first line break after 100 chars
    const firstBreakAfter100 = description.indexOf('\n', 100);
    if (firstBreakAfter100 !== -1) {
      return description.substring(0, firstBreakAfter100);
    }

    // No line break found, truncate at 200 chars with ellipsis
    if (description.length > 200) {
      return description.substring(0, 197) + '...';
    }

    return description;
  }

  /**
   * Parses the words parameter into keywords and search mode.
   * @param words - String or object with and/or arrays
   * @returns Keywords array and search mode
   * @internal
   */
  private parseWordsParameter(words: unknown): ParsedWordsParameter {
    let keywords: string[] = [];
    let searchMode: 'and' | 'or' = 'and';

    if (typeof words === 'string') {
      keywords = words.toLowerCase().split(/\s+/).filter(Boolean);
    } else if (typeof words === 'object' && words !== null) {
      if ('and' in words && Array.isArray(words.and)) {
        keywords = words.and.map((k) => k.toLowerCase());
        searchMode = 'and';
      } else if ('or' in words && Array.isArray(words.or)) {
        keywords = words.or.map((k) => k.toLowerCase());
        searchMode = 'or';
      } else {
        throw new Error('Invalid words format - use string, {and: [...]}, or {or: [...]}');
      }
    } else {
      throw new Error('Missing or invalid "words" parameter');
    }

    return { keywords, searchMode };
  }

  /**
   * Formats a single tool with its arguments for display.
   * @param match - Tool match to format
   * @returns Formatted tool string
   * @internal
   */
  private formatToolWithArgs(match: ToolMatch): string {
    const inputSchema = match.definition?.inputSchema;

    const args = Object.entries(inputSchema?.properties || {}).map(([argName, prop]) => {
      const def = prop as { type: string; description?: string };
      let retVal = `${argName}: ${def.type}`;
      if (match.definition?.inputSchema?.required?.includes(argName)) {
        retVal += ' [required]';
      }
      return retVal;
    });

    let retVal = `- ${match.fullName}: ${match.description}`;
    if (args.length) {
      retVal += `\n  args:`;
      for (const arg of args) {
        retVal += `\n    - ${arg}`;
      }
    }
    return retVal;
  }

  /**
   * Handles enabling discovered tools and returns formatted result.
   * @param matches - Tool matches to enable
   * @param context - Core tool context
   * @returns Call tool result
   * @internal
   */
  private async handleEnableTools(
    matches: ToolMatch[],
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    const toolNames = matches.map((m) => m.fullName);
    context.toolRegistry.enableTools(toolNames, 'discovery');
    await context.sendNotification?.('tools/list_changed');

    const enabledList = matches.map((m) => this.formatToolWithArgs(m)).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found and enabled ${matches.length} tools:\n${enabledList}\n\nNote: Always call tools using the fully prefixed name exactly as listed. To run a tool next, use bridge_tool_request with {"tool":"<full_name>","arguments":{...}} and consult get_tool_schema first for required arguments.`,
        },
      ],
    };
  }

  /**
   * Handles case when no tools match the search criteria.
   * @param keywords - Search keywords used
   * @param context - Core tool context
   * @returns Call tool result
   * @internal
   */
  private handleNoMatches(keywords: string[], context: CoreToolContext): CallToolResult {
    const registryContext = RegistryContext.getInstance(context.config, {
      configPath: context.configPath || './.mcp-funnel.json',
    });
    const hasRegistries = registryContext.hasRegistries();

    let message = `No local tools found matching keywords: ${keywords.join(' ')}`;
    if (hasRegistries) {
      message += `\n\nTip: Try searching MCP registries for additional tools:\nsearch_registry_tools "${keywords.join(' ')}"`;
    }

    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
    };
  }

  /**
   * Formats discovered tools with their current state.
   * @param matches - Tool matches to format
   * @returns Call tool result
   * @internal
   */
  private formatDiscoveredTools(matches: ToolMatch[]): CallToolResult {
    const matchList = matches
      .map((m) => {
        const status = m.exposed ? '✓' : m.enabled ? '◐' : '○';
        const truncatedDesc = this.truncateDescription(m.description);
        return `${status} ${m.fullName}: ${truncatedDesc}`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text:
            `Found ${matches.length} tools:\n${matchList}\n\n` +
            'Legend: ✓ Exposed | ◐ Enabled | ○ Discovered\n' +
            'Use enable=true to activate discovered tools.',
        },
      ],
    };
  }

  public async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    const { keywords, searchMode } = this.parseWordsParameter(args.words);
    const enable = typeof args.enable === 'boolean' ? args.enable : false;
    const matches = context.toolRegistry.searchTools(keywords, searchMode);

    if (enable && matches.length > 0) {
      return this.handleEnableTools(matches, context);
    }

    if (matches.length === 0) {
      return this.handleNoMatches(keywords, context);
    }

    return this.formatDiscoveredTools(matches);
  }
}
