import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { matchesPattern } from '../../utils/pattern-matcher.js';

export interface LoadToolsetByNameParams {
  name: string;
}

export interface LoadToolsetByPatternsParams {
  tools: string[];
}

export type LoadToolsetParams =
  | LoadToolsetByNameParams
  | LoadToolsetByPatternsParams;

function isLoadByName(params: unknown): params is LoadToolsetByNameParams {
  return typeof params === 'object' && params !== null && 'name' in params;
}

function isLoadByPatterns(
  params: unknown,
): params is LoadToolsetByPatternsParams {
  return typeof params === 'object' && params !== null && 'tools' in params;
}

function findMatchingTools(
  patterns: string[],
  toolRegistry: import('../../tool-registry.js').ToolRegistry,
): string[] {
  const matchedTools: string[] = [];
  const allTools = toolRegistry.getAllTools();

  for (const tool of allTools) {
    if (!tool.discovered) continue;
    for (const pattern of patterns) {
      if (matchesPattern(tool.fullName, pattern)) {
        matchedTools.push(tool.fullName);
        break; // Tool matched, no need to check other patterns
      }
    }
  }

  return matchedTools;
}

export class LoadToolset extends BaseCoreTool {
  readonly name = 'load_toolset';

  get tool(): Tool {
    return {
      name: this.name,
      description:
        'Load a predefined toolset or specific tool patterns to enable them for use. Provide EITHER "name" for a predefined toolset OR "tools" for explicit patterns.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Name of predefined toolset to load (mutually exclusive with tools)',
          },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of tool patterns to load (mutually exclusive with name)',
          },
        },
        // Can't use oneOf at top level - will validate in handler
      },
    };
  }

  async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    // Validate mutual exclusivity
    const hasName = 'name' in args && args.name !== undefined;
    const hasTools = 'tools' in args && args.tools !== undefined;

    if (!hasName && !hasTools) {
      return {
        content: [
          {
            type: 'text',
            text: 'Either "name" or "tools" parameter is required',
          },
        ],
        isError: true,
      };
    }

    if (hasName && hasTools) {
      return {
        content: [
          {
            type: 'text',
            text: 'Provide either "name" or "tools", not both',
          },
        ],
        isError: true,
      };
    }

    let patterns: string[];
    let toolsetName: string | undefined;

    if (isLoadByName(args)) {
      // Load from predefined toolset
      if (!context.config.toolsets) {
        return {
          content: [
            {
              type: 'text',
              text: `No toolsets configured. Add a "toolsets" object to your configuration.`,
            },
          ],
          isError: true,
        };
      }

      const toolset = context.config.toolsets[args.name];
      if (!toolset) {
        const available = Object.keys(context.config.toolsets).join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Toolset "${args.name}" not found. Available toolsets: ${available || 'none'}`,
            },
          ],
          isError: true,
        };
      }

      patterns = toolset;
      toolsetName = args.name;
    } else if (isLoadByPatterns(args)) {
      // Load explicit patterns
      if (!args.tools || !Array.isArray(args.tools)) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid tools parameter: must be an array of tool patterns',
            },
          ],
          isError: true,
        };
      }
      patterns = args.tools;
    } else {
      // This should never happen due to the validation above
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid parameters',
          },
        ],
        isError: true,
      };
    }

    // Find all matching tools
    const matchingTools = findMatchingTools(patterns, context.toolRegistry);

    if (matchingTools.length === 0) {
      const patternList = patterns.join(', ');
      return {
        content: [
          {
            type: 'text',
            text: `No tools found matching patterns: ${patternList}`,
          },
        ],
      };
    }

    // Enable the matching tools
    context.toolRegistry.enableTools(matchingTools, 'toolset');
    await context.sendNotification?.('tools/list_changed');

    // Create response message
    const responseText = toolsetName
      ? `Loaded ${matchingTools.length} tools from "${toolsetName}" toolset`
      : `Loaded ${matchingTools.length} tools matching specified patterns`;

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  }
}
