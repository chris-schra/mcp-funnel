/**
 * CallToolResult interface - matches @mcp-funnel/commands-core format
 */
export interface CallToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}
