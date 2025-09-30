import { Hono } from 'hono';
import { serve, ServerType } from '@hono/node-server';
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
import { appRoute } from './app/index.js';
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
  /**
   * Configuration for inbound authentication to the proxy server
   * Authentication is MANDATORY by default for security.
   * Set DISABLE_INBOUND_AUTH=true environment variable to disable (DEV ONLY)
   */
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

  // Authentication is MANDATORY for security
  if (!inboundAuth) {
    console.error(
      '❌ SECURITY ERROR: No authentication configuration provided!',
    );
    console.error(
      '❌ Server cannot start without authentication for security.',
    );
    console.error(
      '💡 Use DISABLE_INBOUND_AUTH=true environment variable to disable (DEV ONLY).',
    );
    throw new Error(
      'Inbound authentication is mandatory. Provide auth config or set DISABLE_INBOUND_AUTH=true.',
    );
  }

  // Setup authentication - always required
  let authMiddleware = null;
  let authValidator = null;
  try {
    validateAuthConfig(inboundAuth);
    authValidator = createAuthValidator(inboundAuth);
    authMiddleware = createAuthMiddleware(authValidator);

    if (inboundAuth.type === 'none') {
      console.warn(
        '🚨 WARNING: Authentication is DISABLED - this is insecure!',
      );
      console.warn('🚨 WARNING: Only use for development/testing purposes.');
    } else {
      console.info(`✅ Inbound authentication enabled: ${inboundAuth.type}`);
    }
  } catch (error) {
    console.error('❌ Failed to setup inbound authentication:', error);
    throw error;
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

  // Apply authentication middleware to ALL API routes for security
  // Only skip auth for health check endpoint
  if (authMiddleware) {
    app.use('/api/*', authMiddleware);
  }

  // API routes - now all protected by authentication middleware
  app.route('/api/servers', serversRoute);
  app.route('/api/tools', toolsRoute);
  app.route('/api/config', configRoute);
  app.route('/api/oauth', oauthRoute);
  app.route('/api/streamable', streamableRoute);
  app.route('/app', appRoute);

  // Health check endpoint - intentionally placed AFTER auth middleware setup
  // This means /api/health will also require authentication for security
  // To allow unauthenticated health checks, move this BEFORE the auth middleware
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
      authenticated: true, // Indicates this response required authentication
    });
  });

  // Serve static files in production
  if (staticPath) {
    const { serveStatic } = await import('@hono/node-server/serve-static');
    app.use('/*', serveStatic({ root: staticPath }));
  }

  // Create HTTP server with Hono and wait for it to be listening
  return new Promise<ServerType>((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        port,
        hostname: host,
        createServer,
      },
      (serverInfo) => {
        console.info(
          `🚀 Web UI server running at http://${host}:${serverInfo?.port || port}`,
        );
        resolve(server);
      },
    );

    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server startup failed:', error);
      reject(error);
    });

    // graceful shutdown
    process.on('SIGINT', () => {
      server.close();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      server.close((err) => {
        if (err) {
          console.error(err);
          process.exit(1);
        }
        process.exit(0);
      });
    });

    // Setup WebSocket server
    const wss = new WebSocketServer({ noServer: true });
    const wsManager = new WebSocketManager(mcpProxy);

    server.on('upgrade', async (request, socket, head) => {
      if (request.url === '/ws') {
        // Validate authentication for WebSocket connections - ALWAYS required
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
  });
}

// Type augmentation for Hono context
declare module 'hono' {
  interface ContextVariableMap {
    mcpProxy: MCPProxy;
  }
}
