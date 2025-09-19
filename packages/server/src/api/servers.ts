import { Hono } from 'hono';
import type { ServerStatus } from '../types/index.js';
import type { MCPProxy } from 'mcp-funnel';

type Variables = {
  mcpProxy: MCPProxy;
};

export const serversRoute = new Hono<{ Variables: Variables }>();

serversRoute.get('/', async (c) => {
  const mcpProxy = c.get('mcpProxy');

  try {
    // Get all servers from MCP proxy
    const servers: ServerStatus[] = [];

    // Get status for each server using getServerStatus method
    for (const [name, _client] of mcpProxy.clients) {
      try {
        const serverStatus = await mcpProxy.getServerStatus(name);
        servers.push(serverStatus);
      } catch (error) {
        // If getting status fails, include server with error status
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
    // Check if server exists in the configured servers
    const hasServer =
      mcpProxy.clients.has(name) ||
      Array.from(mcpProxy.getTargetServers().disconnected).some(
        ([serverName]) => serverName === name,
      );

    if (!hasServer) {
      return c.json(
        {
          error: 'Server not found',
          message: `Server '${name}' is not configured`,
        },
        404,
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
    // Check if server is currently connected
    if (!mcpProxy.clients.has(name)) {
      return c.json(
        {
          error: 'Server not connected',
          message: `Server '${name}' is not currently connected`,
        },
        404,
      );
    }

    // Attempt to disconnect the server
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
