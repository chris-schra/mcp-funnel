/**
 * Response formatting utilities for MCP tool calls.
 *
 * Provides consistent response formatting for both success and error cases
 * in MCP tool execution, ensuring proper structure for the MCP protocol.
 * @internal
 */
import type { CallToolResult } from '@mcp-funnel/commands-core';

/**
 * Creates an error response for MCP tool calls.
 * @param message - Error message to return to the caller
 * @returns CallToolResult with isError flag set
 * @public
 * @see file:../../command.ts:97 - Usage in tool execution
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
 * Creates a success response for MCP tool calls.
 *
 * Formats one or two text content blocks into a CallToolResult structure.
 * The optional additional text is useful for providing usage hints or context.
 * @param text - Primary response text (typically JSON-stringified data)
 * @param additionalText - Optional secondary text for hints or instructions
 * @returns CallToolResult with text content blocks
 * @public
 * @see file:../../command.ts:104 - Usage in tool execution
 */
export function createTextResponse(text: string, additionalText?: string): CallToolResult {
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
