import { Hono } from 'hono';
import { ServerResponse } from 'node:http';
import { serve, type HttpBindings } from '@hono/node-server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import type { MCPProxy } from 'mcp-funnel';

type Variables = {
  mcpProxy: MCPProxy;
};

type Bindings = HttpBindings;

export const streamableRoute = new Hono<{
  Variables: Variables;
  Bindings: Bindings;
}>();

/**
 * Global storage for the StreamableHTTP transport and MCPProxy
 */
interface StreamableHTTPBridge {
  transport: StreamableHTTPServerTransport;
  mcpProxy: MCPProxy;
  isConnected: boolean;
}

let globalStreamableBridge: StreamableHTTPBridge | null = null;
let initializationPromise: Promise<StreamableHTTPBridge> | null = null;

/**
 * Initialize the StreamableHTTP bridge
 * Connects the StreamableHTTP transport to the MCPProxy's existing server
 */
async function initializeStreamableBridge(
  mcpProxy: MCPProxy,
): Promise<StreamableHTTPBridge> {
  // Return existing bridge if connected
  if (globalStreamableBridge && globalStreamableBridge.isConnected) {
    return globalStreamableBridge;
  }

  // Prevent race conditions - if already initializing, wait for that
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization with race condition protection
  initializationPromise = (async () => {
    try {
      // The MCPProxy in web server mode is initialized but NOT started with any transport,
      // which is perfect - we can connect StreamableHTTP without conflicts.
      // If using MCPProxy standalone, it should be started with { transport: "streamable-http" }
      // option to prevent stdio from being connected.

      // Create the StreamableHTTP transport
      const transport = new StreamableHTTPServerTransport({
        // Generate secure session IDs for stateful connections
        sessionIdGenerator: () => randomUUID(),

        // Session lifecycle callbacks
        onsessioninitialized: async (sessionId: string) => {
          console.info(`StreamableHTTP session initialized: ${sessionId}`);
        },

        onsessionclosed: async (sessionId: string) => {
          console.info(`StreamableHTTP session closed: ${sessionId}`);
        },

        // Prefer SSE streaming over JSON responses for better real-time experience
        enableJsonResponse: false,

        // DNS rebinding protection - allow localhost and any host for development
        // In production, this should be configured with specific allowed hosts
        allowedHosts: ['localhost', '127.0.0.1', '0.0.0.0'],
        allowedOrigins: ['http://localhost:3456', 'https://localhost:3456'],
        enableDnsRebindingProtection: false, // Disabled for development, enable in production
      });

      try {
        // Connect the StreamableHTTP transport to the MCPProxy's existing server
        // This gives StreamableHTTP clients full access to all MCPProxy tools and functionality
        // NOTE: MCP SDK likely only supports one transport at a time. If this fails,
        // it might be because another transport is already connected.
        await mcpProxy.server.connect(transport);

        console.info('StreamableHTTP transport connected to MCPProxy server');

        const bridge: StreamableHTTPBridge = {
          transport,
          mcpProxy,
          isConnected: true,
        };

        globalStreamableBridge = bridge;
        return bridge;
      } catch (error) {
        console.error('Failed to create StreamableHTTP bridge:', error);
        // If connection fails, it might be because stdio is already connected
        // Make sure MCPProxy is started with { transport: "streamable-http" } option
        throw error;
      }
    } finally {
      // Clear the promise to allow retry on failure
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

/**
 * StreamableHTTP MCP endpoint
 * Handles GET (SSE streams), POST (JSON-RPC messages), and DELETE (session termination)
 *
 * This endpoint exposes the MCPProxy server via the MCP Streamable HTTP transport:
 * - GET: Establishes SSE stream for real-time communication with MCPProxy
 * - POST: Sends JSON-RPC messages to MCPProxy's tools
 * - DELETE: Terminates sessions
 *
 * All MCPProxy tools and functionality are available through this transport
 */
streamableRoute.all('/mcp', async (c) => {
  const mcpProxy = c.get('mcpProxy');

  try {
    // Get or initialize the StreamableHTTP bridge
    const bridge = await initializeStreamableBridge(mcpProxy);

    // Convert Hono request/response to Node.js format for SDK compatibility
    const nodeReq = c.env.incoming;
    const nodeRes = c.env.outgoing;

    // Parse request body for POST requests
    let parsedBody: unknown;
    if (c.req.method === 'POST') {
      try {
        parsedBody = await c.req.json();
        console.debug('Request:\n', JSON.stringify(parsedBody, null, 2));
      } catch (error) {
        console.error('Failed to parse request body:', error);
        return c.json({ error: 'Invalid JSON in request body' }, 400);
      }
    }

    // Intercept response writes to log what's being sent
    const originalWrite = nodeRes.write.bind(nodeRes);

    // Capture response chunks for debugging
    const responseChunks: Buffer[] = [];

    // @ts-expect-error override write method
    nodeRes.write = function (
      chunk: unknown,
      encodingOrCallback: BufferEncoding,
      callback: ((error: Error | null | undefined) => void) | undefined,
    ) {
      // Log the chunk being written
      if (chunk) {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as ArrayLike<number>);
        responseChunks.push(buffer);
      }
      return originalWrite.call(this, chunk, encodingOrCallback, callback);
    };

    const handleFinish = () => {
      const fullResponse = Buffer.concat(responseChunks).toString('utf8');

      try {
        const m = fullResponse.match(/event: message\ndata: (.*)/);
        if (m && m[1]) {
          const data = JSON.parse(m[1]);
          console.info('Response:\n', JSON.stringify(data, null, 2));
        }
      } catch (error) {
        console.error('Failed to parse response body:', error);
      } finally {
        nodeRes.off('finish', handleFinish);
        nodeReq.off('close', handleClose);
      }
    };

    const handleClose = () => {
      console.info('StreamableHTTP connection closed');
      bridge.transport.close().then(() => {
        console.info('transport closed');
        bridge.isConnected = false;
      });
    };

    nodeRes.on('finish', handleFinish);
    nodeReq.on('close', handleClose);

    // Handle the request using the StreamableHTTP transport
    // The transport will directly write to nodeRes
    await bridge.transport.handleRequest(nodeReq, nodeRes, parsedBody);

    c.res = undefined; // Prevent Hono from sending its own response
    // Return an empty Response that Hono will ignore since headers are already sent
    c.res = new Response(null, {
      status: 204,
      headers: {
        'x-hono-already-sent': 'true',
      },
    });
  } catch (error) {
    console.error('StreamableHTTP request handling error:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

/**
 * Health check endpoint for StreamableHTTP transport
 */
streamableRoute.get('/health', (c) => {
  return c.json({
    status: 'ok',
    transport: 'streamable-http',
    timestamp: new Date().toISOString(),
    endpoints: {
      mcp: '/api/streamable/mcp',
      health: '/api/streamable/health',
    },
    documentation: {
      protocol: 'MCP Streamable HTTP',
      methods: ['GET', 'POST', 'DELETE'],
      description: {
        GET: 'Establishes SSE stream for real-time MCP communication',
        POST: 'Sends JSON-RPC messages to MCP server',
        DELETE: 'Terminates active sessions',
      },
      authentication:
        'Compatible with existing auth middleware - auth info can be passed via request headers',
      sessionManagement: 'Stateful with UUID-based session IDs',
    },
  });
});

/**
 * ENDPOINT DOCUMENTATION
 *
 * StreamableHTTP MCP Transport Server
 * ==================================
 *
 * Base URL: /api/streamable/mcp
 *
 * This endpoint exposes the full MCPProxy server (with all aggregated tools from
 * multiple MCP servers) through the StreamableHTTP transport, which supports both
 * Server-Sent Events (SSE) streaming and direct JSON responses.
 *
 * Supported HTTP Methods:
 * ----------------------
 *
 * GET:
 * - Establishes an SSE stream for real-time bidirectional communication
 * - Returns a persistent connection that streams MCP messages
 * - Supports session resumption via Last-Event-ID header
 * - Example: GET /api/streamable/mcp
 *
 * POST:
 * - Sends JSON-RPC messages to the MCP server
 * - Requires valid JSON-RPC 2.0 message in request body
 * - Returns JSON response or continues SSE stream
 * - Example: POST /api/streamable/mcp with {"jsonrpc":"2.0","method":"tools/list","id":1}
 *
 * DELETE:
 * - Terminates active sessions and cleans up resources
 * - Useful for graceful session cleanup
 * - Example: DELETE /api/streamable/mcp
 *
 * Authentication Integration:
 * --------------------------
 *
 * The StreamableHTTP transport supports authentication through the
 * IncomingMessage.auth property. To integrate with auth middleware:
 *
 * 1. Add auth middleware before the streamable route
 * 2. Set req.auth with AuthInfo object containing authentication details
 * 3. The transport will automatically include auth context in MCP messages
 *
 * Session Management:
 * ------------------
 *
 * - Uses UUID-based session IDs for stateful connections
 * - Session state is maintained in memory
 * - Sessions are automatically created on first request
 * - Sessions can be explicitly terminated via DELETE requests
 *
 * Error Handling:
 * --------------
 *
 * - Invalid JSON in POST requests: 400 Bad Request
 * - Server errors: 500 Internal Server Error with details
 * - Transport errors are logged and handled gracefully
 *
 * Usage Examples:
 * --------------
 *
 * Connect StreamableHTTP client to access all MCPProxy tools:
 * ```typescript
 * import { StreamableHTTPClientTransport } from 'mcp-funnel';
 *
 * const transport = new StreamableHTTPClientTransport({
 *   url: 'http://localhost:3456/api/streamable/mcp',
 *   authProvider: yourAuthProvider, // optional
 * });
 *
 * await transport.start();
 * // Now you have access to all MCPProxy aggregated tools!
 * ```
 *
 * Direct HTTP requests:
 * ```bash
 * # Establish SSE stream
 * curl -N -H "Accept: text/event-stream" http://localhost:3456/api/streamable/mcp
 *
 * # Send MCP request
 * curl -X POST -H "Content-Type: application/json" \
 *   -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
 *   http://localhost:3456/api/streamable/mcp
 * ```
 */
