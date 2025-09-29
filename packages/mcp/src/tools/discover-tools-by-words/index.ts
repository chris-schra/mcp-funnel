import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { RegistryContext } from '../../mcp-registry/index.js';

export interface ToolMatch {
  name: string;
  serverName: string;
  description: string;
  score: number;
  exposed?: boolean;
  enabled?: boolean;
}

/**
 * Core tool for discovering and dynamically enabling MCP tools based on keyword search
 * @since 1.0.0
 * @version 1.0.0
 * @category Tools
 * @internal
 * @see file://../core-tool.interface.ts#L33
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
   * Truncate description to first line break after 100 chars, or at 200 chars if no line break
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

  public async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    // Parse the words parameter which can be string or object
    let keywords: string[] = [];
    let searchMode: 'and' | 'or' = 'and'; // Default to AND logic

    if (typeof args.words === 'string') {
      // Legacy string format - use AND logic
      keywords = args.words.toLowerCase().split(/\s+/).filter(Boolean);
    } else if (typeof args.words === 'object' && args.words !== null) {
      if ('and' in args.words && Array.isArray(args.words.and)) {
        keywords = args.words.and.map((k) => k.toLowerCase());
        searchMode = 'and';
      } else if ('or' in args.words && Array.isArray(args.words.or)) {
        keywords = args.words.or.map((k) => k.toLowerCase());
        searchMode = 'or';
      } else {
        throw new Error(
          'Invalid words format - use string, {and: [...]}, or {or: [...]}',
        );
      }
    } else {
      throw new Error('Missing or invalid "words" parameter');
    }

    const enable = typeof args.enable === 'boolean' ? args.enable : false;

    // Use registry's search capability with the appropriate mode
    const matches = context.toolRegistry.searchTools(keywords, searchMode);

    if (enable && matches.length > 0) {
      // Enable the discovered tools
      const toolNames = matches.map((m) => m.fullName);
      context.toolRegistry.enableTools(toolNames, 'discovery');
      await context.sendNotification?.('tools/list_changed');

      const enabledList = matches
        .map((m) => {
          const inputSchema = m.definition?.inputSchema;

          const args = Object.entries(inputSchema?.properties || {}).map(
            ([argName, prop]) => {
              const def = prop as { type: string; description?: string };
              let retVal = `${argName}: ${def.type}`;
              if (m.definition?.inputSchema?.required?.includes(argName)) {
                retVal += ' [required]';
              }
              return retVal;
            },
          );

          // Use full description when enabling (contains usage instructions)
          // Use truncated description for discovery listing
          const desc = enable
            ? m.description
            : this.truncateDescription(m.description);
          let retVal = `- ${m.fullName}: ${desc}`;
          if (args.length) {
            retVal += `\n  args:`;
            for (const arg of args) {
              retVal += `\n    - ${arg}`;
            }
          }
          return retVal;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found and enabled ${matches.length} tools:\n${enabledList}\n\nNote: Always call tools using the fully prefixed name exactly as listed. To run a tool next, use bridge_tool_request with {"tool":"<full_name>","arguments":{...}} and consult get_tool_schema first for required arguments.`,
          },
        ],
      };
    }

    if (matches.length === 0) {
      // Check if registries are configured to suggest registry search
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

    // Show discovered tools with their current state
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
}
