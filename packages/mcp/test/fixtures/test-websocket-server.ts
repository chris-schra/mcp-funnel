/**
 * Test WebSocket Server for Integration Tests
 *
 * A real WebSocket server implementation for testing purposes.
 * Implements the WebSocket protocol with OAuth2 authentication support.
 *
 * This is NOT a mock - it's a real WebSocket server that implements
 * the WebSocket protocol for testing purposes.
 */

import { createServer, Server, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { randomUUID } from 'crypto';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export interface TestWebSocketServerConfig {
  port?: number;
  requireAuth?: boolean;
  validToken?: string;
  maxConnections?: number;
}

export interface WebSocketClient {
  id: string;
  ws: WebSocket;
  connectedAt: Date;
  lastPing?: Date;
  lastPong?: Date;
}

/**
 * Real WebSocket server for integration testing
 */
export class TestWebSocketServer {
  private httpServer: Server;
  private wsServer: WebSocketServer;
  private port: number;
  private requireAuth: boolean;
  private validToken?: string;
  private maxConnections: number;
  private clients: Map<string, WebSocketClient> = new Map();
  private messageHistory: Array<{
    id: string;
    clientId: string;
    data: JSONRPCMessage;
    timestamp: Date;
    direction: 'incoming' | 'outgoing';
  }> = [];

  constructor(config: TestWebSocketServerConfig = {}) {
    this.port = config.port ?? 0; // 0 = random available port
    this.requireAuth = config.requireAuth ?? false;
    this.validToken = config.validToken;
    this.maxConnections = config.maxConnections ?? 100;

    this.httpServer = createServer(this.handleHttpRequest.bind(this));
    this.wsServer = new WebSocketServer({
      server: this.httpServer,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this),
    });

    this.setupWebSocketHandlers();
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        const address = this.httpServer.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to get server address'));
          return;
        }

        const actualPort = address.port;
        const url = `http://localhost:${actualPort}`;

        resolve({ port: actualPort, url });
      });
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    // Close all client connections
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1000, 'Server shutting down');
      }
    }
    this.clients.clear();

    // Close WebSocket server
    this.wsServer.close();

    // Close HTTP server
    return new Promise((resolve, reject) => {
      this.httpServer.close((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: JSONRPCMessage): void {
    const messageId = randomUUID();
    const messageText = JSON.stringify(message);

    for (const [clientId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(messageText);

          this.messageHistory.push({
            id: messageId,
            clientId,
            data: message,
            timestamp: new Date(),
            direction: 'outgoing',
          });
        } catch (error) {
          console.error(`Error broadcasting to client ${clientId}:`, error);
          this.clients.delete(clientId);
        }
      } else {
        // Clean up disconnected clients
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: JSONRPCMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const messageText = JSON.stringify(message);
      client.ws.send(messageText);

      this.messageHistory.push({
        id: randomUUID(),
        clientId,
        data: message,
        timestamp: new Date(),
        direction: 'outgoing',
      });

      return true;
    } catch (error) {
      console.error(`Error sending to client ${clientId}:`, error);
      this.clients.delete(clientId);
      return false;
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    // Clean up disconnected clients first
    for (const [clientId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.CLOSED) {
        this.clients.delete(clientId);
      }
    }
    return this.clients.size;
  }

  /**
   * Get list of connected client IDs
   */
  getConnectedClients(): string[] {
    this.getClientCount(); // Clean up first
    return Array.from(this.clients.keys());
  }

  /**
   * Get message history
   */
  getMessageHistory(): Array<{
    id: string;
    clientId: string;
    data: JSONRPCMessage;
    timestamp: Date;
    direction: 'incoming' | 'outgoing';
  }> {
    return [...this.messageHistory];
  }

  /**
   * Clear message history
   */
  clearMessageHistory(): void {
    this.messageHistory = [];
  }

  /**
   * Set the valid token for authentication (for testing token changes)
   */
  setValidToken(token: string): void {
    this.validToken = token;
  }

  /**
   * Disconnect a specific client
   */
  disconnectClient(
    clientId: string,
    code = 1000,
    reason = 'Server disconnect',
  ): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    client.ws.close(code, reason);
    this.clients.delete(clientId);
    return true;
  }

  /**
   * Verify client connection (authentication check)
   */
  private verifyClient(info: {
    origin: string;
    secure: boolean;
    req: IncomingMessage;
  }): boolean {
    if (!this.requireAuth) {
      return true;
    }

    // Check authorization header
    const authHeader = info.req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }

    const token = authHeader.slice(7);
    return this.validToken ? token === this.validToken : true;
  }

  /**
   * Setup WebSocket connection handlers
   */
  private setupWebSocketHandlers(): void {
    this.wsServer.on(
      'connection',
      (ws: WebSocket, _request: IncomingMessage) => {
        const clientId = randomUUID();

        // Check connection limits
        if (this.clients.size >= this.maxConnections) {
          ws.close(1013, 'Server overloaded');
          return;
        }

        const client: WebSocketClient = {
          id: clientId,
          ws,
          connectedAt: new Date(),
        };

        this.clients.set(clientId, client);

        // Send welcome message
        const welcomeMessage = {
          jsonrpc: '2.0' as const,
          method: 'server/welcome',
          params: {
            clientId,
            serverTime: new Date().toISOString(),
            message: 'Connected to test WebSocket server',
          },
        };

        ws.send(JSON.stringify(welcomeMessage));

        // Setup client event handlers
        ws.on('message', (data: Buffer) => {
          try {
            const messageText = data.toString('utf8');
            const message = JSON.parse(messageText) as JSONRPCMessage;

            this.messageHistory.push({
              id: randomUUID(),
              clientId,
              data: message,
              timestamp: new Date(),
              direction: 'incoming',
            });

            // Echo back any JSON-RPC requests for testing
            if ('method' in message && 'id' in message) {
              const response = {
                jsonrpc: '2.0' as const,
                id: message.id,
                result: {
                  echo: message,
                  processedAt: new Date().toISOString(),
                },
              };
              ws.send(JSON.stringify(response));
            }
          } catch (error) {
            console.error(
              `Error processing message from client ${clientId}:`,
              error,
            );
            ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32700,
                  message: 'Parse error',
                },
              }),
            );
          }
        });

        ws.on('ping', (data: Buffer) => {
          client.lastPing = new Date();
          ws.pong(data);
        });

        ws.on('pong', () => {
          client.lastPong = new Date();
        });

        ws.on('close', (_code: number, _reason: Buffer) => {
          this.clients.delete(clientId);
        });

        ws.on('error', (error: Error) => {
          console.error(`WebSocket error for client ${clientId}:`, error);
          this.clients.delete(clientId);
        });
      },
    );

    this.wsServer.on('error', (error: Error) => {
      console.error('WebSocket server error:', error);
    });
  }

  /**
   * Handle HTTP requests (for health checks, etc.)
   */
  private async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url!, `http://localhost:${this.port}`);

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Cache-Control',
      );

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health check endpoint
      if (url.pathname === '/health' && req.method === 'GET') {
        this.sendJsonResponse(res, 200, {
          status: 'ok',
          clients: this.getClientCount(),
          timestamp: new Date().toISOString(),
          websocketEndpoint: '/ws',
        });
        return;
      }

      // WebSocket upgrade is handled by ws library
      if (url.pathname === '/ws') {
        // This should be handled by the WebSocket server
        this.sendJsonResponse(res, 426, {
          error: 'Upgrade Required',
          message: 'This endpoint requires WebSocket upgrade',
        });
        return;
      }

      // Not found
      this.sendJsonResponse(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error('HTTP server error:', error);
      this.sendJsonResponse(res, 500, { error: 'Internal server error' });
    }
  }

  /**
   * Send JSON response
   */
  private sendJsonResponse(
    res: ServerResponse,
    statusCode: number,
    data: unknown,
  ): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(data));
  }
}

// Fix the import issue
import type { ServerResponse } from 'http';

/**
 * Helper function to create and start a test WebSocket server
 */
export async function createTestWebSocketServer(
  config?: TestWebSocketServerConfig,
): Promise<{
  server: TestWebSocketServer;
  port: number;
  url: string;
  wsEndpoint: string;
  healthEndpoint: string;
}> {
  const server = new TestWebSocketServer(config);
  const { port, url } = await server.start();

  return {
    server,
    port,
    url,
    wsEndpoint: `ws://localhost:${port}/ws`,
    healthEndpoint: `${url}/health`,
  };
}
