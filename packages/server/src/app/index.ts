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

appRoute.use(async (ctx, next) => {
  debugger;
  return viteDevServer.middlewares(ctx.req.raw, ctx.res, (...args) => {
    const c = ctx;

    debugger;
  });
});

appRoute.get('/', async (c) => {
  const v = viteDevServer;
  return c.json('OK');
});
