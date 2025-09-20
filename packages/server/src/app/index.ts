import { Hono } from 'hono';
import type { MCPProxy } from 'mcp-funnel';

type Variables = {
  mcpProxy: MCPProxy;
};

export const appRoute = new Hono<{ Variables: Variables }>();
