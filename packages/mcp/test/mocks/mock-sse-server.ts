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
          reject(new Error('Failed to get server address'));
          return;
        }

        this.isStarted = true;
        const serverInfo = {
          port: address.port,
          host: this.config.host,
          url: `http://${this.config.host}:${address.port}`,
        };

        resolve(serverInfo);
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    if (!this.isStarted || !this.server) {
      return;
    }

    // Close all SSE connections
    for (const connection of this.connections.values()) {
      if (connection.isActive) {
        connection.response.end();
      }
    }
    this.connections.clear();

    return new Promise((resolve, reject) => {
      this.server!.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.isStarted = false;
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Send a message to all connected clients
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
    this.sendMessageToConnections(message);
  }

  /**
   * Send a message to a specific connection
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

    this.sendMessageToSingleConnection(connection, message);
    return true;
  }

  /**
   * Simulate server errors
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
   */
  getStats(): {
    activeConnections: number;
    totalConnections: number;
    messagesSent: number;
    messagesReceived: number;
    isStarted: boolean;
  } {
    const activeConnections = Array.from(this.connections.values()).filter(
      (conn) => conn.isActive,
    ).length;

    return {
      activeConnections,
      totalConnections: this.connections.size,
      messagesSent: this.messageQueue.length,
      messagesReceived: this.receivedMessages.length,
      isStarted: this.isStarted,
    };
  }

  /**
   * Get received messages (from POST requests)
   */
  getReceivedMessages(): Array<{
    id: string;
    data: unknown;
    timestamp: number;
  }> {
    return [...this.receivedMessages];
  }

  /**
   * Clear all received messages
   */
  clearReceivedMessages(): void {
    this.receivedMessages = [];
  }

  /**
   * Get active connection IDs
   */
  getActiveConnectionIds(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, conn]) => conn.isActive)
      .map(([id]) => id);
  }

  private createExpressApp(): Express {
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(express.text());

    if (this.config.enableCors) {
      app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header(
          'Access-Control-Allow-Headers',
          'Origin, X-Requested-With, Content-Type, Accept, Authorization, Last-Event-ID, Cache-Control',
        );
        if (req.method === 'OPTIONS') {
          res.sendStatus(200);
          return;
        }
        next();
      });
    }

    // Latency simulation middleware
    if (this.config.simulateLatency > 0) {
      app.use((req, res, next) => {
        setTimeout(next, this.config.simulateLatency);
      });
    }

    // SSE endpoint
    app.get('/events', this.handleSSEConnection.bind(this));

    // POST endpoint for receiving messages
    app.post('/messages', this.handleMessagePost.bind(this));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Error simulation endpoint
    app.get('/error/:code', (req, res) => {
      const code = parseInt(req.params.code, 10);
      res.status(code).json({ error: `Simulated ${code} error` });
    });

    return app;
  }

  private async handleSSEConnection(
    req: Request,
    res: Response,
  ): Promise<void> {
    // Simulate various error conditions
    if (
      this.shouldSimulateConnectionError ||
      Math.random() < this.connectionFailureRate
    ) {
      res.status(503).json({ error: 'Service temporarily unavailable' });
      return;
    }

    if (this.shouldSimulate500Error) {
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    // Auth validation
    if (this.config.requireAuth) {
      const authHeader = req.headers.authorization;
      const authQuery = req.query.auth as string;

      const providedToken = authHeader?.replace('Bearer ', '') || authQuery;

      if (
        this.shouldSimulateAuthFailure ||
        providedToken !== this.config.authToken
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    // Add response delay if configured
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

    // Send initial connection message
    this.sendSSEMessage(res, 'connected', 'connection', connectionId);

    // Send any queued messages that come after the lastEventId
    if (lastEventId) {
      const lastEventIndex = this.messageQueue.findIndex(
        (msg) => msg.id === lastEventId,
      );
      const messagesToSend =
        lastEventIndex >= 0
          ? this.messageQueue.slice(lastEventIndex + 1)
          : this.messageQueue;

      messagesToSend.forEach((message) => {
        this.sendMessageToSingleConnection(connection, message);
      });
    } else {
      // Send all queued messages for new connections
      this.messageQueue.forEach((message) => {
        this.sendMessageToSingleConnection(connection, message);
      });
    }

    // Handle client disconnect
    req.on('close', () => {
      connection.isActive = false;
      this.connections.delete(connectionId);
    });

    req.on('error', () => {
      connection.isActive = false;
      this.connections.delete(connectionId);
    });
  }

  private async handleMessagePost(req: Request, res: Response): Promise<void> {
    // Auth validation for POST requests
    if (this.config.requireAuth) {
      const authHeader = req.headers.authorization;
      const providedToken = authHeader?.replace('Bearer ', '');

      if (
        this.shouldSimulateAuthFailure ||
        providedToken !== this.config.authToken
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    if (this.shouldSimulate500Error) {
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    // Add response delay if configured
    if (this.responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelayMs));
    }

    // Store the received message
    const messageId = uuidv4();
    this.receivedMessages.push({
      id: messageId,
      data: req.body,
      timestamp: Date.now(),
    });

    res.json({ success: true, messageId, timestamp: Date.now() });
  }

  private sendMessageToConnections(message: QueuedMessage): void {
    for (const connection of this.connections.values()) {
      if (connection.isActive) {
        this.sendMessageToSingleConnection(connection, message);
      }
    }
  }

  private sendMessageToSingleConnection(
    connection: SSEConnection,
    message: QueuedMessage,
  ): void {
    if (!connection.isActive) {
      return;
    }

    try {
      this.sendSSEMessage(
        connection.response,
        message.data,
        message.event,
        message.id,
        message.retry,
      );
    } catch (_error) {
      // Connection might be closed
      connection.isActive = false;
      this.connections.delete(connection.id);
    }
  }

  private sendSSEMessage(
    res: Response,
    data: string,
    event?: string,
    id?: string,
    retry?: number,
  ): void {
    if (id) {
      res.write(`id: ${id}\n`);
    }
    if (event) {
      res.write(`event: ${event}\n`);
    }
    if (retry !== undefined) {
      res.write(`retry: ${retry}\n`);
    }
    res.write(`data: ${data}\n\n`);
  }
}

/**
 * Helper function to create and start a mock SSE server for tests
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
