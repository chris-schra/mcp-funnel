/**
 * Response formatting functions for MCP tool calls
 */
import type { CallToolResult } from '@mcp-funnel/commands-core';

/**
 * Create an error response for MCP tool calls
 */
export function createErrorResponse(message: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    isError: true,
  };
}

/**
 * Create a text response for MCP tool calls
 */
export function createTextResponse(
  text: string,
  additionalText?: string,
): CallToolResult {
  const content: Array<{ type: 'text'; text: string }> = [
    {
      type: 'text',
      text,
    },
  ];

  if (additionalText) {
    content.push({
      type: 'text',
      text: additionalText,
    });
  }

  return { content };
}
