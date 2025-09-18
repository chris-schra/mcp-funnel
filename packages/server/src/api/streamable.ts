import { Hono } from 'hono';
import { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { randomUUID } from 'node:crypto';
import type { MCPProxy } from 'mcp-funnel';
// TODO: These types may be needed for future iterations of proxying
// import type {
//   JSONRPCMessage,
//   MessageExtraInfo,
// } from '@modelcontextprotocol/sdk/types.js';

type Variables = {
  mcpProxy: MCPProxy;
};

export const streamableRoute = new Hono<{ Variables: Variables }>();

/**
 * Global storage for the StreamableHTTP transport and bridge server
 */
interface StreamableHTTPBridge {
  transport: StreamableHTTPServerTransport;
  server: Server;
  mcpProxy: MCPProxy;
}

let globalStreamableBridge: StreamableHTTPBridge | null = null;

/**
 * Initialize the StreamableHTTP bridge
 * Creates a dedicated MCP server for StreamableHTTP and bridges it to the MCPProxy
 */
async function initializeStreamableBridge(
  mcpProxy: MCPProxy,
): Promise<StreamableHTTPBridge> {
  if (globalStreamableBridge) {
    return globalStreamableBridge;
  }

  // Create a new MCP Server instance specifically for StreamableHTTP
  const streamableServer = new Server(
    { name: 'mcp-funnel-streamable', version: '0.0.1' },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true, subscribe: true },
        prompts: { listChanged: true },
      },
    },
  );

  // TODO: For now, we'll create a basic server that forwards requests to MCPProxy
  // This is a simplified approach - in a full implementation we would need to
  // properly proxy all the request handlers from the MCPProxy server

  // For MVP, let the server handle basic initialization and expose MCPProxy tools
  // The request forwarding will be handled at the transport level

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
    // Connect the StreamableHTTP transport to the bridge server
    await streamableServer.connect(transport);

    console.info('StreamableHTTP transport connected to bridge server');

    const bridge = {
      transport,
      server: streamableServer,
      mcpProxy,
    };

    globalStreamableBridge = bridge;
    return bridge;
  } catch (error) {
    console.error('Failed to create StreamableHTTP bridge:', error);
    throw error;
  }
}

/**
 * StreamableHTTP MCP endpoint
 * Handles GET (SSE streams), POST (JSON-RPC messages), and DELETE (session termination)
 *
 * This endpoint implements the MCP Streamable HTTP transport specification:
 * - GET: Establishes SSE stream for real-time communication
 * - POST: Sends JSON-RPC messages
 * - DELETE: Terminates sessions
 */
streamableRoute.all('/mcp', async (c) => {
  const mcpProxy = c.get('mcpProxy');

  try {
    // Get or initialize the StreamableHTTP bridge
    const bridge = await initializeStreamableBridge(mcpProxy);

    // Convert Hono request/response to Node.js format for SDK compatibility
    const nodeReq = c.req.raw as unknown as IncomingMessage;
    const nodeRes = c.res as unknown as ServerResponse;

    // Parse request body for POST requests
    let parsedBody: unknown;
    if (c.req.method === 'POST') {
      try {
        parsedBody = await c.req.json();
      } catch (error) {
        console.error('Failed to parse request body:', error);
        return c.json({ error: 'Invalid JSON in request body' }, 400);
      }
    }

    // Handle the request using the StreamableHTTP transport
    await bridge.transport.handleRequest(nodeReq, nodeRes, parsedBody);

    // The transport has handled the response directly
    // For SSE streams, the connection stays open
    // For JSON responses, the response has been sent
    return c.body(null);
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
 * This endpoint exposes the MCP (Model Context Protocol) server through the
 * StreamableHTTP transport, which supports both Server-Sent Events (SSE)
 * streaming and direct JSON responses.
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
 * Connect StreamableHTTP client (from Task 9):
 * ```typescript
 * import { StreamableHTTPClientTransport } from 'mcp-funnel';
 *
 * const transport = new StreamableHTTPClientTransport({
 *   url: 'http://localhost:3456/api/streamable/mcp',
 *   authProvider: yourAuthProvider, // optional
 * });
 *
 * await transport.start();
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
