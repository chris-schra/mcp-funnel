import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ICoreTool, CoreToolContext } from '../../tools/core-tool.interface.js';
import { ToolRegistry } from '../../tool-registry.js';

export interface IRequestHandler {
  /**
   * Set up request handlers on the MCP server
   */
  setupRequestHandlers(
    server: Server,
    coreTools: Map<string, ICoreTool>,
    toolRegistry: ToolRegistry,
    createToolContext: () => CoreToolContext,
  ): void;
}
