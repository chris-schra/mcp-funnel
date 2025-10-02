/**
 * MCP Funnel web server providing HTTP/WebSocket/SSE APIs for MCPProxy.
 *
 * Exposes multiple transport protocols:
 * - REST API: Server and tool management endpoints
 * - WebSocket: Real-time bidirectional communication
 * - Streamable HTTP: MCP protocol SSE transport
 * - OAuth: Authentication flow endpoints
 *
 * Security: Mandatory authentication by default. All API routes protected
 * except health check (which can be moved before middleware to allow unauthenticated access).
 * @public
 * @see file:./dev.ts - Development server entry point
 * @see file:./auth/auth-factory.ts - Authentication configuration
 */

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

/**
 * Configuration options for web server startup.
 * @public
 */
export interface ServerOptions {
  /** HTTP server port, defaults to 3456 */
  port?: number;
  /** Bind address, defaults to 0.0.0.0 */
  host?: string;
  /** Path to static file directory for production UI serving */
  staticPath?: string;
  /**
   * Inbound authentication configuration.
   *
   * Authentication is MANDATORY for security. Server will refuse to start
   * without this option. Set type: 'none' to disable (development only).
   */
  inboundAuth?: InboundAuthConfig;
}

type Variables = {
  mcpProxy: MCPProxy;
};

/**
 * Validates and configures authentication middleware.
 * @param inboundAuth - Authentication configuration
 * @returns Configured auth middleware and validator
 * @throws When auth config is missing or invalid
 */
function setupAuthentication(inboundAuth: InboundAuthConfig | undefined) {
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

  try {
    validateAuthConfig(inboundAuth);
    const authValidator = createAuthValidator(inboundAuth);
    const authMiddleware = createAuthMiddleware(authValidator);

    if (inboundAuth.type === 'none') {
      console.warn(
        '🚨 WARNING: Authentication is DISABLED - this is insecure!',
      );
      console.warn('🚨 WARNING: Only use for development/testing purposes.');
    } else {
      console.info(`✅ Inbound authentication enabled: ${inboundAuth.type}`);
    }

    return { authValidator, authMiddleware };
  } catch (error) {
    console.error('❌ Failed to setup inbound authentication:', error);
    throw error;
  }
}

/**
 * Creates and configures Hono application with routes and middleware.
 * @param mcpProxy - MCPProxy instance
 * @param authMiddleware - Authentication middleware
 * @param staticPath - Optional static file directory
 * @returns Configured Hono app
 */
async function createHonoApp(
  mcpProxy: MCPProxy,
  authMiddleware: ReturnType<typeof createAuthMiddleware> | null,
  staticPath?: string,
) {
  const app = new Hono<{ Variables: Variables }>();

  // Middleware
  app.use('*', cors());
  app.use('*', logger());

  // Store MCP proxy instance in context
  app.use('*', async (c, next) => {
    c.set('mcpProxy', mcpProxy);
    await next();
  });

  // Apply authentication middleware to ALL API routes
  if (authMiddleware) {
    app.use('/api/*', authMiddleware);
  }

  // API routes - protected by authentication middleware
  app.route('/api/servers', serversRoute);
  app.route('/api/tools', toolsRoute);
  app.route('/api/config', configRoute);
  app.route('/api/oauth', oauthRoute);
  app.route('/api/streamable', streamableRoute);
  app.route('/app', appRoute);

  // Health check endpoint
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
      authenticated: true,
    });
  });

  // Serve static files in production
  if (staticPath) {
    const { serveStatic } = await import('@hono/node-server/serve-static');
    app.use('/*', serveStatic({ root: staticPath }));
  }

  return app;
}

/**
 * Configures graceful shutdown handlers for process signals.
 * @param server - HTTP server instance
 */
function setupGracefulShutdown(server: ServerType) {
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
}

/**
 * Handles WebSocket authentication validation.
 * @param request - Upgrade request
 * @param socket - Socket instance
 * @param authValidator - Auth validator
 * @returns True if authenticated, false otherwise
 */
async function handleWebSocketAuth(
  request: Parameters<typeof validateWebSocketAuth>[0],
  socket: { write: (data: string) => void; destroy: () => void },
  authValidator: ReturnType<typeof createAuthValidator>,
): Promise<boolean> {
  try {
    const authResult = await validateWebSocketAuth(request, authValidator);
    if (!authResult.isAuthenticated) {
      console.warn('WebSocket authentication failed:', {
        ip: request.socket.remoteAddress,
        userAgent: request.headers['user-agent'],
        error: authResult.error,
        timestamp: new Date().toISOString(),
      });

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
      return false;
    }
    return true;
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
    return false;
  }
}

/**
 * Starts MCP Funnel web server with configured transport endpoints.
 *
 * Sets up Hono application with:
 * - CORS and request logging middleware
 * - Authentication middleware on all /api/* routes
 * - REST API routes for servers, tools, config
 * - WebSocket endpoint at /ws with auth validation
 * - Streamable HTTP transport at /api/streamable/mcp
 * - Optional static file serving
 * @param mcpProxy - Initialized MCPProxy instance
 * @param options - Server configuration options
 * @returns Promise resolving to Node.js HTTP server instance
 * @throws When inboundAuth is not provided (security requirement)
 * @throws When authentication configuration is invalid
 * @example
 * ```typescript
 * const proxy = new MCPProxy(config);
 * await proxy.initialize();
 *
 * const server = await startWebServer(proxy, \{
 *   port: 3456,
 *   inboundAuth: \{ type: 'bearer', tokens: ['secret'] \}
 * \});
 * ```
 * @public
 */
export async function startWebServer(
  mcpProxy: MCPProxy,
  options: ServerOptions = {},
) {
  const { port = 3456, host = '0.0.0.0', staticPath, inboundAuth } = options;

  // Setup authentication
  const { authValidator, authMiddleware } = setupAuthentication(inboundAuth);

  // Create Hono app with routes
  const app = await createHonoApp(mcpProxy, authMiddleware, staticPath);

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

    // Setup graceful shutdown
    setupGracefulShutdown(server);

    // Setup WebSocket server
    const wss = new WebSocketServer({ noServer: true });
    const wsManager = new WebSocketManager(mcpProxy);

    server.on('upgrade', async (request, socket, head) => {
      if (request.url === '/ws') {
        const isAuthenticated = await handleWebSocketAuth(
          request,
          socket,
          authValidator,
        );
        if (!isAuthenticated) return;

        // Proceed with WebSocket upgrade
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
