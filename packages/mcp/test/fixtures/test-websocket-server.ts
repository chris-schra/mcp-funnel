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
import {
  sendJsonResponse,
  createWelcomeMessage,
  createEchoResponse,
  createParseErrorResponse,
  recordMessage,
} from './websocket-server-helpers.js';

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
   * Starts the WebSocket server and returns port and URL
   * @returns Server port and URL
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

  /** Stops the WebSocket server and closes all connections */
  async stop(): Promise<void> {
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1000, 'Server shutting down');
      }
    }
    this.clients.clear();
    this.wsServer.close();

    // Close HTTP server
    return new Promise((resolve, reject) => {
      this.httpServer.close((error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
  }

  /**
   * Broadcasts message to all connected clients
   * @param message - JSON-RPC message to broadcast
   */
  broadcast(message: JSONRPCMessage): void {
    const messageText = JSON.stringify(message);

    for (const [clientId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(messageText);
          recordMessage(
            this.messageHistory,
            clientId,
            message,
            'outgoing',
          );
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
   * Sends message to specific client, returns true if successful
   * @param clientId - Target client ID
   * @param message - JSON-RPC message to send
   * @returns True if send was successful
   */
  sendToClient(clientId: string, message: JSONRPCMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const messageText = JSON.stringify(message);
      client.ws.send(messageText);
      recordMessage(this.messageHistory, clientId, message, 'outgoing');
      return true;
    } catch (error) {
      console.error(`Error sending to client ${clientId}:`, error);
      this.clients.delete(clientId);
      return false;
    }
  }

  /**
   * Returns count of connected clients
   * @returns Number of active connections
   */
  getClientCount(): number {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.CLOSED) this.clients.delete(clientId);
    }
    return this.clients.size;
  }

  /**
   * Returns list of connected client IDs
   * @returns Array of client ID strings
   */
  getConnectedClients(): string[] {
    this.getClientCount();
    return Array.from(this.clients.keys());
  }

  /**
   * Returns all message history
   * @returns Array of all sent and received messages with metadata
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

  /** Clears all message history */
  clearMessageHistory(): void {
    this.messageHistory = [];
  }

  /**
   * Sets valid token for authentication during token change testing
   * @param token - Valid bearer token for authentication
   */
  setValidToken(token: string): void {
    this.validToken = token;
  }

  /**
   * Disconnects specific client with given code and reason
   * @param clientId - ID of client to disconnect
   * @param code - WebSocket close code
   * @param reason - Human-readable close reason
   * @returns True if client was found and disconnected
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
   * Verifies client connection by checking authentication
   * @param info - Connection verification info with origin, security status, and HTTP request
   * @returns True if client is authorized to connect
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

    return this.validToken ? authHeader.slice(7) === this.validToken : true;
  }

  /** Sets up WebSocket connection handlers */
  private setupWebSocketHandlers(): void {
    this.wsServer.on(
      'connection',
      (ws: WebSocket, _request: IncomingMessage) => {
        const clientId = randomUUID();
        if (this.clients.size >= this.maxConnections) {
          ws.close(1013, 'Server overloaded');
          return;
        }

        const client: WebSocketClient = { id: clientId, ws, connectedAt: new Date() };
        this.clients.set(clientId, client);
        ws.send(JSON.stringify(createWelcomeMessage(clientId)));
        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString('utf8')) as JSONRPCMessage;
            recordMessage(this.messageHistory, clientId, message, 'incoming');
            if ('method' in message && 'id' in message) {
              ws.send(JSON.stringify(createEchoResponse(message)));
            }
          } catch (error) {
            console.error(`Error processing message from client ${clientId}:`, error);
            ws.send(JSON.stringify(createParseErrorResponse()));
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
   * Handles HTTP requests for health checks
   * @param req - Incoming HTTP request
   * @param res - HTTP response object
   */
  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url!, `http://localhost:${this.port}`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      if (url.pathname === '/health' && req.method === 'GET') {
        sendJsonResponse(res, 200, {
          status: 'ok',
          clients: this.getClientCount(),
          timestamp: new Date().toISOString(),
          websocketEndpoint: '/ws',
        });
        return;
      }

      if (url.pathname === '/ws') {
        sendJsonResponse(res, 426, { error: 'Upgrade Required', message: 'This endpoint requires WebSocket upgrade' });
        return;
      }
      sendJsonResponse(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error('HTTP server error:', error);
      sendJsonResponse(res, 500, { error: 'Internal server error' });
    }
  }
}

/**
 * Creates and starts a test WebSocket server with given config
 * @param config - Optional server configuration
 * @returns Promise resolving to server instance and connection details
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
