/**
 * Mock SSE Server implementation for testing SSE transports
 *
 * This mock provides:
 * - SSE endpoint with event streaming
 * - POST endpoint for messages
 * - Auth validation simulation
 * - Error simulation capabilities
 * - Controllable server behavior for various test scenarios
 *
 * Uses Express to provide realistic HTTP/SSE server behavior
 */

import express, { type Express, type Request, type Response } from 'express';
import { createServer, type Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { extractBearerToken } from '@mcp-funnel/auth';
import {
  sendSSEMessage,
  sendMessageToSingleConnection,
  broadcastToConnections,
  setCORSHeaders,
} from './sse-server-helpers.js';

export interface MockSSEServerConfig {
  port?: number;
  host?: string;
  requireAuth?: boolean;
  authToken?: string;
  enableCors?: boolean;
  simulateLatency?: number;
}

export interface SSEConnection {
  id: string;
  response: Response;
  lastEventId?: string;
  isActive: boolean;
}

export interface QueuedMessage {
  id: string;
  data: string;
  event?: string;
  retry?: number;
  timestamp: number;
}

/**
 * Mock SSE Server for testing SSE transport implementations
 */
export class MockSSEServer {
  private app: Express;
  private server: Server | null = null;
  private connections = new Map<string, SSEConnection>();
  private messageQueue: QueuedMessage[] = [];
  private config: Required<MockSSEServerConfig>;
  private isStarted = false;
  private receivedMessages: Array<{
    id: string;
    data: unknown;
    timestamp: number;
  }> = [];

  // Error simulation
  private shouldSimulateConnectionError = false;
  private shouldSimulateAuthFailure = false;
  private shouldSimulate500Error = false;
  private connectionFailureRate = 0; // 0-1 probability
  private responseDelayMs = 0;

  constructor(config: MockSSEServerConfig = {}) {
    this.config = {
      port: config.port ?? 0, // Let OS assign port
      host: config.host ?? 'localhost',
      requireAuth: config.requireAuth ?? true,
      authToken: config.authToken ?? 'test-bearer-token',
      enableCors: config.enableCors ?? true,
      simulateLatency: config.simulateLatency ?? 0,
    };

    this.app = this.createExpressApp();
  }

  /**
   * Start the mock server
   * @returns Promise resolving to server connection details
   */
  async start(): Promise<{ port: number; host: string; url: string }> {
    if (this.isStarted) {
      throw new Error('Server is already started');
    }

    return new Promise((resolve, reject) => {
      this.server = createServer(this.app);
      this.server.listen(this.config.port, this.config.host, () => {
        const address = this.server!.address();
        if (!address || typeof address === 'string') {
          return reject(new Error('Failed to get server address'));
        }
        this.isStarted = true;
        resolve({
          port: address.port,
          host: this.config.host,
          url: `http://${this.config.host}:${address.port}`,
        });
      });
      this.server.on('error', reject);
    });
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    if (!this.isStarted || !this.server) return;

    for (const connection of this.connections.values()) {
      if (connection.isActive) connection.response.end();
    }
    this.connections.clear();

    return new Promise((resolve, reject) => {
      this.server!.close((err) => {
        if (err) return reject(err);
        this.isStarted = false;
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Send a message to all connected clients
   * @param data - Message data to send
   * @param event - Event type name
   * @param retry - Retry interval in milliseconds
   */
  broadcastMessage(data: string, event = 'message', retry?: number): void {
    const message: QueuedMessage = {
      id: uuidv4(),
      data,
      event,
      retry,
      timestamp: Date.now(),
    };

    this.messageQueue.push(message);
    broadcastToConnections(
      this.connections,
      message,
      (id) => this.connections.delete(id),
    );
  }

  /**
   * Send a message to a specific connection
   * @param connectionId - Target connection ID
   * @param data - Message data to send
   * @param event - Event type name
   * @returns True if message was sent successfully
   */
  sendMessageToConnection(
    connectionId: string,
    data: string,
    event = 'message',
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isActive) {
      return false;
    }

    const message: QueuedMessage = {
      id: uuidv4(),
      data,
      event,
      timestamp: Date.now(),
    };

    sendMessageToSingleConnection(connection, message, (id) =>
      this.connections.delete(id),
    );
    return true;
  }

  /**
   * Simulate server errors
   * @param shouldError - Enable or disable connection error simulation
   */
  simulateConnectionError(shouldError = true): void {
    this.shouldSimulateConnectionError = shouldError;
  }

  simulateAuthFailure(shouldFail = true): void {
    this.shouldSimulateAuthFailure = shouldFail;
  }

  simulate500Error(shouldError = true): void {
    this.shouldSimulate500Error = shouldError;
  }

  setConnectionFailureRate(rate: number): void {
    this.connectionFailureRate = Math.max(0, Math.min(1, rate));
  }

  setResponseDelay(delayMs: number): void {
    this.responseDelayMs = Math.max(0, delayMs);
  }

  /**
   * Get server statistics
   * @returns Object containing connection and message statistics
   */
  getStats() {
    return {
      activeConnections: Array.from(this.connections.values()).filter((c) => c.isActive).length,
      totalConnections: this.connections.size,
      messagesSent: this.messageQueue.length,
      messagesReceived: this.receivedMessages.length,
      isStarted: this.isStarted,
    };
  }

  /**
   * Get received messages (from POST requests)
   * @returns Array of all messages received via POST endpoint
   */
  getReceivedMessages() {
    return [...this.receivedMessages];
  }

  /** Clear all received messages */
  clearReceivedMessages(): void {
    this.receivedMessages = [];
  }

  /**
   * Get active connection IDs
   * @returns Array of active connection ID strings
   */
  getActiveConnectionIds(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, c]) => c.isActive)
      .map(([id]) => id);
  }

  private createExpressApp(): Express {
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(express.text());

    if (this.config.enableCors) {
      app.use((req, res, next) => {
        setCORSHeaders(res);
        if (req.method === 'OPTIONS') {
          res.sendStatus(200);
          return;
        }
        next();
      });
    }

    if (this.config.simulateLatency > 0) {
      app.use((req, res, next) =>
        setTimeout(next, this.config.simulateLatency),
      );
    }

    // SSE endpoint
    app.get('/events', this.handleSSEConnection.bind(this));

    app.post('/messages', this.handleMessagePost.bind(this));
    app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));
    app.get('/error/:code', (req, res) => {
      const code = parseInt(req.params.code, 10);
      res.status(code).json({ error: `Simulated ${code} error` });
    });

    return app;
  }

  private async handleSSEConnection(req: Request, res: Response): Promise<void> {
    if (this.shouldSimulateConnectionError || Math.random() < this.connectionFailureRate) {
      res.status(503).json({ error: 'Service temporarily unavailable' });
      return;
    }
    if (this.shouldSimulate500Error) {
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    if (this.config.requireAuth) {
      const authHeader = req.headers.authorization;
      const providedToken = authHeader ? extractBearerToken(authHeader) : null;
      if (this.shouldSimulateAuthFailure || providedToken !== this.config.authToken) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
    if (this.responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelayMs));
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Create connection
    const connectionId = uuidv4();
    const lastEventId = req.headers['last-event-id'] as string;

    const connection: SSEConnection = {
      id: connectionId,
      response: res,
      lastEventId,
      isActive: true,
    };

    this.connections.set(connectionId, connection);

    sendSSEMessage(res, 'connected', 'connection', connectionId);

    const messagesToSend = lastEventId
      ? this.messageQueue.slice(
          Math.max(
            0,
            this.messageQueue.findIndex((msg) => msg.id === lastEventId) + 1,
          ),
        )
      : this.messageQueue;

    messagesToSend.forEach((msg) =>
      sendMessageToSingleConnection(connection, msg, (id) =>
        this.connections.delete(id),
      ),
    );

    const cleanup = () => {
      connection.isActive = false;
      this.connections.delete(connectionId);
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
  }

  private async handleMessagePost(req: Request, res: Response): Promise<void> {
    if (this.config.requireAuth) {
      const authHeader = req.headers.authorization;
      const providedToken = authHeader ? extractBearerToken(authHeader) : null;
      if (this.shouldSimulateAuthFailure || providedToken !== this.config.authToken) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
    if (this.shouldSimulate500Error) {
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    if (this.responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelayMs));
    }
    const messageId = uuidv4();
    this.receivedMessages.push({ id: messageId, data: req.body, timestamp: Date.now() });
    res.json({ success: true, messageId, timestamp: Date.now() });
  }

}

/**
 * Helper function to create and start a mock SSE server for tests
 * @param config - Optional server configuration
 * @returns Promise resolving to server instance and connection details
 */
export async function createMockSSEServer(
  config?: MockSSEServerConfig,
): Promise<{ server: MockSSEServer; url: string; port: number }> {
  const server = new MockSSEServer(config);
  const serverInfo = await server.start();

  return {
    server,
    url: serverInfo.url,
    port: serverInfo.port,
  };
}
