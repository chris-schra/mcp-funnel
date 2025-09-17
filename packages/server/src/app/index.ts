import { Hono } from 'hono';
import type { MCPProxy, ServersRecord } from 'mcp-funnel';

type Variables = {
  mcpProxy: MCPProxy;
};

export const appRoute = new Hono<{ Variables: Variables }>();
const viteDevServer = await import('vite').then((vite) =>
  vite.createServer({
    server: { middlewareMode: true },
  }),
);
