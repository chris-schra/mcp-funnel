/**
 * Test SSE Server for Integration Tests
 *
 * A real Server-Sent Events (SSE) server implementation for testing purposes.
 * This implements the SSE protocol with OAuth2 authentication support.
 *
 * This is NOT a mock - it's a real HTTP server that implements
 * the SSE protocol for testing purposes.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { randomUUID } from 'crypto';

export interface TestSSEServerConfig {
  port?: number;
  requireAuth?: boolean;
  validToken?: string;
}

export interface SSEClient {
  id: string;
  response: ServerResponse;
  connectedAt: Date;
}

/**
 * Real SSE server for integration testing
 */
export class TestSSEServer {
  private server: Server;
  private port: number;
  private requireAuth: boolean;
  private validToken?: string;
  private clients: Map<string, SSEClient> = new Map();
  private messageHistory: Array<{
    id: string;
    data: unknown;
    timestamp: Date;
  }> = [];

  constructor(config: TestSSEServerConfig = {}) {
    this.port = config.port ?? 0; // 0 = random available port
    this.requireAuth = config.requireAuth ?? false;
    this.validToken = config.validToken;

    this.server = createServer(this.handleRequest.bind(this));
  }

  /**
   * Start the SSE server
   */
  async start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        const address = this.server.address();
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
   * Stop the SSE server
   */
  async stop(): Promise<void> {
    // Close all client connections
    for (const client of this.clients.values()) {
      if (!client.response.destroyed) {
        client.response.end();
      }
    }
    this.clients.clear();

    return new Promise((resolve, reject) => {
      this.server.close((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Send a message to all connected clients
   */
  broadcast(data: unknown): void {
    const messageId = randomUUID();
    const message = {
      id: messageId,
      data,
      timestamp: new Date(),
    };

    this.messageHistory.push(message);

    const sseData = this.formatSSEMessage(messageId, data);

    for (const [clientId, client] of this.clients.entries()) {
      try {
        if (!client.response.destroyed) {
          client.response.write(sseData);
        } else {
          // Clean up destroyed connections
          this.clients.delete(clientId);
        }
      } catch (error) {
        console.error(`Error sending to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Send a message to a specific client
   */
  sendToClient(clientId: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.response.destroyed) {
      return false;
    }

    const messageId = randomUUID();
    const sseData = this.formatSSEMessage(messageId, data);

    try {
      client.response.write(sseData);
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
    // Clean up destroyed connections first
    for (const [clientId, client] of this.clients.entries()) {
      if (client.response.destroyed) {
        this.clients.delete(clientId);
      }
    }
    return this.clients.size;
  }

  /**
   * Get message history
   */
  getMessageHistory(): Array<{ id: string; data: unknown; timestamp: Date }> {
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
   * Handle incoming HTTP requests
   */
  private async handleRequest(
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

      // SSE endpoint
      if (url.pathname === '/sse' && req.method === 'GET') {
        await this.handleSSEConnection(req, res);
        return;
      }

      // Message posting endpoint (for testing)
      if (url.pathname === '/send' && req.method === 'POST') {
        await this.handleSendMessage(req, res);
        return;
      }

      // Health check endpoint
      if (url.pathname === '/health' && req.method === 'GET') {
        this.sendJsonResponse(res, 200, {
          status: 'ok',
          clients: this.getClientCount(),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Not found
      this.sendJsonResponse(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error('SSE server error:', error);
      this.sendJsonResponse(res, 500, { error: 'Internal server error' });
    }
  }

  /**
   * Handle SSE connection requests
   */
  private async handleSSEConnection(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Check authentication if required
    if (this.requireAuth) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer' });
        res.end('Authentication required');
        return;
      }

      const token = authHeader.slice(7);
      if (this.validToken && token !== this.validToken) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer' });
        res.end('Invalid token');
        return;
      }
    }

    // Set up SSE connection
    const clientId = randomUUID();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial connection event
    const welcomeMessage = this.formatSSEMessage('welcome', {
      clientId,
      message: 'Connected to test SSE server',
      timestamp: new Date().toISOString(),
    });

    res.write(welcomeMessage);

    // Store client connection
    const client: SSEClient = {
      id: clientId,
      response: res,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
    });

    req.on('error', () => {
      this.clients.delete(clientId);
    });

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      if (!res.destroyed) {
        res.write(
          'data: {"type":"heartbeat","timestamp":"' +
            new Date().toISOString() +
            '"}\n\n',
        );
      } else {
        clearInterval(heartbeat);
        this.clients.delete(clientId);
      }
    }, 30000); // 30 seconds

    // Clean up heartbeat when connection closes
    res.on('close', () => {
      clearInterval(heartbeat);
    });
  }

  /**
   * Handle message sending requests (for testing)
   */
  private async handleSendMessage(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const body = await this.parseRequestBody(req);
      const data = JSON.parse(body);

      if (data.clientId) {
        // Send to specific client
        const success = this.sendToClient(data.clientId, data.message);
        this.sendJsonResponse(res, success ? 200 : 404, {
          success,
          clientId: data.clientId,
        });
      } else {
        // Broadcast to all clients
        this.broadcast(data.message);
        this.sendJsonResponse(res, 200, {
          success: true,
          clients: this.getClientCount(),
        });
      }
    } catch (_error) {
      this.sendJsonResponse(res, 400, { error: 'Invalid JSON' });
    }
  }

  /**
   * Format data as SSE message
   */
  private formatSSEMessage(id: string, data: unknown): string {
    const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
    return `id: ${id}\ndata: ${jsonData}\n\n`;
  }

  /**
   * Parse request body as text
   */
  private async parseRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
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

/**
 * Helper function to create and start a test SSE server
 */
export async function createTestSSEServer(
  config?: TestSSEServerConfig,
): Promise<{
  server: TestSSEServer;
  port: number;
  url: string;
  sseEndpoint: string;
  sendEndpoint: string;
}> {
  const server = new TestSSEServer(config);
  const { port, url } = await server.start();

  return {
    server,
    port,
    url,
    sseEndpoint: `${url}/sse`,
    sendEndpoint: `${url}/send`,
  };
}
