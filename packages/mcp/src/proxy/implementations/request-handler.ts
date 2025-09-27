import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from '../../tools/core-tool.interface.js';
import { ToolRegistry } from '../../tool-registry.js';
import { IRequestHandler } from '../interfaces/request-handler.interface.js';

export class RequestHandler implements IRequestHandler {
  setupRequestHandlers(
    server: Server,
    coreTools: Map<string, ICoreTool>,
    toolRegistry: ToolRegistry,
    createToolContext: () => CoreToolContext,
  ): void {
    // Handle list tools requests
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Get all exposed tools from registry (including core tools)
      const tools = toolRegistry.getExposedTools();
      return { tools };
    });

    // Handle call tool requests
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: toolArgs } = request.params;

      // Check core tools first
      const coreTool = coreTools.get(toolName);
      if (coreTool) {
        return coreTool.handle(toolArgs || {}, createToolContext());
      }

      // Get tool from registry
      const tool = toolRegistry.getToolForExecution(toolName);
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Tool not found: ${toolName}` }],
          isError: true,
        };
      }

      // Execute based on type
      if (tool.command) {
        return tool.command.executeToolViaMCP(
          tool.originalName,
          toolArgs || {},
        );
      }

      if (tool.client) {
        const result = await tool.client.callTool({
          name: tool.originalName,
          arguments: toolArgs || {},
        });
        return result;
      }

      return {
        content: [{ type: 'text', text: `Tool ${toolName} has no executor` }],
        isError: true,
      };
    });
  }
}
