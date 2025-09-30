// SEAMS: Extension point interfaces for the refactored architecture

import type { ToolHandlerContext } from './ToolHandlerContext.js';
import type { CallToolResult } from './CallToolResult.js';

/**
 * Main extension point for MCP tool handlers
 */
export interface IToolHandler<TArgs = Record<string, unknown>> {
  readonly name: string;
  handle(args: TArgs, context: ToolHandlerContext): Promise<CallToolResult>;
}
