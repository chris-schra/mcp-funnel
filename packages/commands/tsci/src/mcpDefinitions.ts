/**
 * MCP tool definitions for TSCI command.
 *
 * Separated from command.ts to maintain file size limits.
 * @internal
 */

import type { Tool } from '@mcp-funnel/commands-core';

/**
 * Returns MCP tool definitions for read_file, describe_symbol, and understand_context.
 * @returns Array of tool definitions with input schemas
 */
export function getTSCIToolDefinitions(): Tool[] {
  return [
    {
      name: 'read_file',
      description:
        'Read a file with automatic structure optimization. Small files (<300 lines) return full content. Large files (≥300 lines) return YAML structure with receiptToken for deferred reading.',
      inputSchema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path relative to project root',
          },
          verbosity: {
            type: 'string',
            enum: ['minimal', 'normal', 'detailed'],
            description: 'Output verbosity (default: minimal for low token usage)',
          },
        },
        required: ['file'],
      },
    },
    {
      name: 'describe_symbol',
      description:
        'Get detailed information about a specific symbol by ID (from read_file YAML structure)',
      inputSchema: {
        type: 'object',
        properties: {
          symbolId: {
            type: 'string',
            description: 'Symbol ID from read_file YAML structure',
          },
          verbosity: {
            type: 'string',
            enum: ['minimal', 'normal', 'detailed'],
            description: 'Output verbosity (default: minimal)',
          },
          file: {
            type: 'string',
            description:
              'Optional file from target project for cross-project lookups (detects tsconfig from file path)',
          },
        },
        required: ['symbolId'],
      },
    },
    {
      name: 'understand_context',
      description:
        'Generate Mermaid diagram showing file relationships and dependencies with automatic import discovery',
      inputSchema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Entry point files to analyze (relative to project root). Imports are automatically discovered.',
          },
          focus: {
            type: 'string',
            description: 'File to highlight in the diagram (optional)',
          },
          maxDepth: {
            type: 'number',
            description:
              'Maximum depth for import traversal (default: 3). Total levels: maxDepth incoming + focus + maxDepth outgoing.',
          },
          ignoreNodeModules: {
            type: 'boolean',
            description: 'Ignore imports from node_modules (default: false)',
          },
        },
        required: ['files'],
      },
    },
  ];
}
