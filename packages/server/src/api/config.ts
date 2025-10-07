import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ConfigUpdateSchema } from '../types/index.js';
import type { MCPProxy } from 'mcp-funnel';
import type { ServersRecord } from '@mcp-funnel/schemas';

type Variables = {
  mcpProxy: MCPProxy;
};

export const configRoute = new Hono<{ Variables: Variables }>();

configRoute.get('/', async (c) => {
  const mcpProxy = c.get('mcpProxy');

  // Normalize servers to handle both array and record formats
  const servers = Array.isArray(mcpProxy.config.servers)
    ? mcpProxy.config.servers
    : Object.entries(mcpProxy.config.servers as ServersRecord).map(([name, server]) => ({
        name,
        ...server,
      }));

  return c.json({
    config: {
      servers: servers.map((s) => ({
        name: s.name,
        command: s.command,
        args: s.args,
      })),
      hideTools: mcpProxy.config.hideTools || [],
      exposeTools: mcpProxy.config.exposeTools || [],
      exposeCoreTools: mcpProxy.config.exposeCoreTools || [],
    },
  });
});

configRoute.patch('/', zValidator('json', ConfigUpdateSchema), async (c) => {
  const updates = c.req.valid('json');
  const mcpProxy = c.get('mcpProxy');

  // Update configuration
  if (updates.hideTools !== undefined) {
    mcpProxy.config.hideTools = updates.hideTools;
  }
  if (updates.exposeTools !== undefined) {
    mcpProxy.config.exposeTools = updates.exposeTools;
  }
  if (updates.exposeCoreTools !== undefined) {
    mcpProxy.config.exposeCoreTools = updates.exposeCoreTools;
  }

  // Notify about configuration change
  mcpProxy.server.sendToolListChanged();

  return c.json({
    success: true,
    config: {
      hideTools: mcpProxy.config.hideTools,
      exposeTools: mcpProxy.config.exposeTools,
      exposeCoreTools: mcpProxy.config.exposeCoreTools,
    },
  });
});
