import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { serversRoute } from './api/servers.js';
import { toolsRoute } from './api/tools.js';
import { configRoute } from './api/config.js';
import { oauthRoute } from './api/oauth.js';
import { streamableRoute } from './api/streamable.js';
import { WebSocketManager } from './ws/manager.js';
import type { MCPProxy } from 'mcp-funnel';
import { appRoute } from './app';
import {
  createAuthValidator,
  validateAuthConfig,
  createAuthMiddleware,
  validateWebSocketAuth,
  type InboundAuthConfig,
} from './auth/index.js';

export interface ServerOptions {
  port?: number;
  host?: string;
  staticPath?: string;
  /** Configuration for inbound authentication to the proxy server */
  inboundAuth?: InboundAuthConfig;
}

type Variables = {
  mcpProxy: MCPProxy;
};

export async function startWebServer(
  mcpProxy: MCPProxy,
  options: ServerOptions = {},
) {
  const { port = 3456, host = '0.0.0.0', staticPath, inboundAuth } = options;

  // Setup authentication if configured
  let authMiddleware = null;
  let authValidator = null;
  if (inboundAuth) {
    try {
      validateAuthConfig(inboundAuth);
      authValidator = createAuthValidator(inboundAuth);
      authMiddleware = createAuthMiddleware(authValidator);
      console.info(`✅ Inbound authentication enabled: ${inboundAuth.type}`);
    } catch (error) {
      console.error('❌ Failed to setup inbound authentication:', error);
      throw error;
    }
  } else {
    console.warn(
      '⚠️  No inbound authentication configured - proxy endpoints are open',
    );
  }

  const app = new Hono<{ Variables: Variables }>();

  // Middleware
  app.use('*', cors());
  app.use('*', logger());

  // Store MCP proxy instance in context
  app.use('*', async (c, next) => {
    c.set('mcpProxy', mcpProxy);
    await next();
  });

  // API routes
  app.route('/api/servers', serversRoute);
  app.route('/api/tools', toolsRoute);
  app.route('/api/config', configRoute);
  app.route('/api/oauth', oauthRoute);

  // Apply authentication middleware to streamable routes if configured
  if (authMiddleware) {
    app.use('/api/streamable/*', authMiddleware);
  }
  app.route('/api/streamable', streamableRoute);

  app.route('/app', appRoute);

  // Health check
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    });
  });

  // Serve static files in production
  if (staticPath) {
    const { serveStatic } = await import('@hono/node-server/serve-static');
    app.use('/*', serveStatic({ root: staticPath }));
  }

  // Create HTTP server with Hono
  const server = serve(
    {
      fetch: app.fetch,
      port,
      hostname: host,
      createServer,
    },
    () => {
      console.info(`🚀 Web UI server running at http://${host}:${port}`);
    },
  );

  // Setup WebSocket server
  const wss = new WebSocketServer({ noServer: true });
  const wsManager = new WebSocketManager(mcpProxy);

  server.on('upgrade', async (request, socket, head) => {
    if (request.url === '/ws') {
      // Validate authentication for WebSocket connections if configured
      if (authValidator) {
        try {
          const authResult = await validateWebSocketAuth(
            request,
            authValidator,
          );
          if (!authResult.isAuthenticated) {
            console.warn('WebSocket authentication failed:', {
              ip: request.socket.remoteAddress,
              userAgent: request.headers['user-agent'],
              error: authResult.error,
              timestamp: new Date().toISOString(),
            });

            // Send 401 Unauthorized and close connection
            socket.write(
              'HTTP/1.1 401 Unauthorized\r\n' +
                'Content-Type: application/json\r\n' +
                'Connection: close\r\n' +
                '\r\n' +
                JSON.stringify({
                  error: 'Unauthorized',
                  message:
                    authResult.error ||
                    'Authentication required for WebSocket connection',
                  timestamp: new Date().toISOString(),
                }),
            );
            socket.destroy();
            return;
          }
        } catch (error) {
          console.error('WebSocket authentication error:', error);
          socket.write(
            'HTTP/1.1 500 Internal Server Error\r\n' +
              'Content-Type: application/json\r\n' +
              'Connection: close\r\n' +
              '\r\n' +
              JSON.stringify({
                error: 'Internal Server Error',
                message: 'Authentication system error',
                timestamp: new Date().toISOString(),
              }),
          );
          socket.destroy();
          return;
        }
      }

      // Authentication passed or not required, proceed with WebSocket upgrade
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    wsManager.handleConnection(ws);
  });

  // Server already listening via hono's serve(). Resolve immediately.
  return Promise.resolve();
}

// Type augmentation for Hono context
declare module 'hono' {
  interface ContextVariableMap {
    mcpProxy: MCPProxy;
  }
}
