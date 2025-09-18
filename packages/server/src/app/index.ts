import { Hono } from 'hono';
import type { MCPProxy } from 'mcp-funnel';

type Variables = {
  mcpProxy: MCPProxy;
};

export const appRoute = new Hono<{ Variables: Variables }>();
// TODO: Implement vite dev server integration in future iterations
// const _viteDevServer = await import('vite').then((vite) =>
//   vite.createServer({
//     server: { middlewareMode: true },
//   }),
// );
