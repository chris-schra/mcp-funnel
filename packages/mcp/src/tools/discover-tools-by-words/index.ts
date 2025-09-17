import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';

export interface DiscoverToolsParams {
  words: string;
  enable?: boolean;
}

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
  readonly name = 'discover_tools_by_words';

  get tool(): Tool {
    return {
      name: this.name,
      description:
        "Search for tools by keywords in their descriptions. IMPORTANT: Use minimal, specific keywords that directly match the user's intent. Each keyword will match ANY tool containing that word - avoid generic terms (github, file, memory) unless the user explicitly mentions them. When enable=true, carefully review the number of matched tools before activation as each tool increases context usage.",
      inputSchema: {
        type: 'object',
        properties: {
          words: {
            type: 'string',
            description:
              'Space-separated keywords to search for in tool descriptions. Be precise and minimal - use only terms that directly match the user\'s intent. Each keyword matches tools containing that word anywhere in their name/description. Avoid platform names (github, filesystem) unless explicitly mentioned by the user. Example: for "PR review", use "pull request review" not "github pull request review code".',
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

  constructor() {
    super();
  }
  async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    // Validate args conform to DiscoverToolsParams
    if (typeof args.words !== 'string') {
      throw new Error('Missing or invalid "words" parameter');
    }

    const typedArgs: DiscoverToolsParams = {
      words: args.words,
      enable: typeof args.enable === 'boolean' ? args.enable : false,
    };

    // Use registry's search capability
    const keywords = typedArgs.words
      .toLowerCase()
      .split(/[\s-]+/)
      .filter(Boolean);
    const matches = context.toolRegistry.searchTools(keywords);

    if (typedArgs.enable && matches.length > 0) {
      // Enable the discovered tools
      const toolNames = matches.map((m) => m.fullName);
      context.toolRegistry.enableTools(toolNames, 'discovery');
      await context.sendNotification?.('tools/list_changed');

      const enabledList = matches
        .map((m) => `- ${m.fullName}: ${m.description}`)
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
      const hasRegistries =
        context.config.registries && context.config.registries.length > 0;

      let message = `No local tools found matching keywords: ${typedArgs.words}`;
      if (hasRegistries) {
        message += `\n\nTip: Try searching MCP registries for additional tools:\nsearch_registry_tools "${typedArgs.words}"`;
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
        return `${status} ${m.fullName}: ${m.description}`;
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
