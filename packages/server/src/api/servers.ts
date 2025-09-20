import { Hono } from 'hono';
import type { ServerStatus } from '../types/index.js';
import type { MCPProxy } from 'mcp-funnel';

const getKnownServerNames = (proxy: MCPProxy): string[] => {
  const { connected, disconnected } = proxy.getTargetServers();
  const seen = new Set<string>();
  const names: string[] = [];

  const add = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  for (const [name] of connected) {
    add(name);
  }

  for (const [name] of disconnected) {
    add(name);
  }

  for (const name of proxy.clients.keys()) {
    add(name);
  }

  return names;
};

type Variables = {
  mcpProxy: MCPProxy;
};

export const serversRoute = new Hono<{ Variables: Variables }>();

serversRoute.get('/', async (c) => {
  const mcpProxy = c.get('mcpProxy');

  try {
    const servers: ServerStatus[] = [];
    const serverNames = getKnownServerNames(mcpProxy);

    for (const name of serverNames) {
      try {
        const serverStatus = mcpProxy.getServerStatus(name);
        servers.push(serverStatus);
      } catch (error) {
        servers.push({
          name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return c.json({ servers });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to retrieve server status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

serversRoute.post('/:name/reconnect', async (c) => {
  const { name } = c.req.param();
  const mcpProxy = c.get('mcpProxy');

  try {
    const knownServers = new Set(getKnownServerNames(mcpProxy));

    if (!knownServers.has(name)) {
      return c.json(
        {
          error: 'Server not found',
          message: `Server '${name}' is not configured`,
        },
        404,
      );
    }

    const currentStatus = mcpProxy.getServerStatus(name);
    if (currentStatus.status === 'connected') {
      return c.json(
        {
          success: false,
          error: 'Reconnection not required',
          message: `Server '${name}' is already connected`,
        },
        409,
      );
    }

    // Attempt to reconnect the server
    await mcpProxy.reconnectServer(name);

    return c.json({
      success: true,
      message: `Successfully reconnected to ${name}`,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'Reconnection failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

serversRoute.delete('/:name', async (c) => {
  const { name } = c.req.param();
  const mcpProxy = c.get('mcpProxy');

  try {
    const knownServers = new Set(getKnownServerNames(mcpProxy));

    if (!knownServers.has(name)) {
      return c.json(
        {
          error: 'Server not found',
          message: `Server '${name}' is not configured`,
        },
        404,
      );
    }

    const currentStatus = mcpProxy.getServerStatus(name);
    if (currentStatus.status !== 'connected') {
      return c.json(
        {
          error: 'Server not connected',
          message: `Server '${name}' is not currently connected`,
        },
        404,
      );
    }
    await mcpProxy.disconnectServer(name);

    return c.json({
      success: true,
      message: `Successfully disconnected from ${name}`,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'Disconnection failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});
