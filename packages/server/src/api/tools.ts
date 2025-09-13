import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ExecuteToolBodySchema } from '../types/index.js';
import type { MCPProxy } from 'mcp-funnel';

type Variables = {
  mcpProxy: MCPProxy;
};

export const toolsRoute = new Hono<{ Variables: Variables }>();

toolsRoute.get('/', async (c) => {
  const mcpProxy = c.get('mcpProxy');

  // Get all available tools
  const tools = [];

  // Get tools from cache
  for (const [fullName, { serverName, tool }] of mcpProxy.toolDefinitionCache) {
    tools.push({
      name: fullName,
      description: tool.description,
      inputSchema: tool.inputSchema,
      serverName,
      enabled:
        mcpProxy.dynamicallyEnabledTools.has(fullName) ||
        !mcpProxy.config.enableDynamicDiscovery,
    });
  }

  return c.json({ tools });
});

toolsRoute.get('/search', async (c) => {
  const query = c.req.query('q')?.toLowerCase();
  const mcpProxy = c.get('mcpProxy');

  if (!query) {
    return c.json({ tools: [] });
  }

  const matchedTools = [];

  for (const [
    fullName,
    { serverName, description },
  ] of mcpProxy.toolDescriptionCache) {
    if (
      fullName.toLowerCase().includes(query) ||
      description.toLowerCase().includes(query)
    ) {
      const toolDef = mcpProxy.toolDefinitionCache.get(fullName);
      if (toolDef) {
        matchedTools.push({
          name: fullName,
          description: toolDef.tool.description,
          inputSchema: toolDef.tool.inputSchema,
          serverName,
          enabled:
            mcpProxy.dynamicallyEnabledTools.has(fullName) ||
            !mcpProxy.config.enableDynamicDiscovery,
        });
      }
    }
  }

  return c.json({ tools: matchedTools });
});

toolsRoute.post(
  '/:name/execute',
  zValidator('json', ExecuteToolBodySchema),
  async (c) => {
    const { name } = c.req.param();
    const body = c.req.valid('json');
    const mcpProxy = c.get('mcpProxy');
    const requestId = globalThis.crypto?.randomUUID()
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      // Emit executing event via WebSocket
      // This will be handled by WebSocketManager

      const startTime = Date.now();

      // Execute tool through MCP proxy
      const mapping = mcpProxy.toolMapping.get(name);
      if (!mapping) {
        return c.json({ error: `Tool not found: ${name}` }, 404);
      }

      if (!mapping.client) throw new Error(`No mapping client found for tool: ${name}`);

      const result = await mapping.client.callTool({
        name: mapping.originalName,
        arguments: body.arguments,
      });

      const duration = Date.now() - startTime;

      return c.json({
        requestId,
        result,
        duration,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json(
        {
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      );
    }
  },
);

toolsRoute.patch('/:name/toggle', async (c) => {
  const { name } = c.req.param();
  const mcpProxy = c.get('mcpProxy');

  if (mcpProxy.dynamicallyEnabledTools.has(name)) {
    mcpProxy.dynamicallyEnabledTools.delete(name);
  } else {
    mcpProxy.dynamicallyEnabledTools.add(name);
  }

  // Notify about tool list change
  mcpProxy.server.sendToolListChanged();

  return c.json({
    enabled: mcpProxy.dynamicallyEnabledTools.has(name),
  });
});
