import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ICDPClient } from '../types/index.js';
import {
  handleWebSocketMessage,
  rejectAllPendingPromises,
  sendCDPRequest,
  type PendingPromise,
} from './message-handler.js';
import { ReconnectionManager } from './reconnection-manager.js';
import {
  isValidWebSocketUrl,
  cleanupWebSocket,
  disconnectWebSocket,
} from './websocket-utils.js';
import {
  setupWebSocketConnection,
  setupWebSocketEventHandlers,
} from './connection-handler.js';

/**
 * CDP Client configuration options
 */
export interface CDPClientOptions {
  /**
   * Connection timeout in milliseconds
   * @default 30000
   */
  connectionTimeout?: number;

  /**
   * Request timeout in milliseconds
   * @default 10000
   */
  requestTimeout?: number;

  /**
   * Maximum reconnection attempts
   * @default 3
   */
  maxReconnectAttempts?: number;

  /**
   * Reconnection delay in milliseconds
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Enable automatic reconnection
   * @default true
   */
  autoReconnect?: boolean;
}

/**
 * Chrome DevTools Protocol WebSocket client implementation
 *
 * Provides a JSON-RPC interface over WebSocket for communicating with:
 * - Node.js inspector endpoints (ws://localhost:9229/...)
 * - Browser DevTools endpoints (ws://localhost:9222/...)
 *
 * Features:
 * - Auto-incrementing message IDs
 * - Promise-based request/response handling
 * - Event emission for CDP events
 * - Automatic reconnection with exponential backoff
 * - Proper resource cleanup
 * - Comprehensive error handling
 */
export class CDPClient extends EventEmitter implements ICDPClient {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private messageId = 0;
  private pendingPromises = new Map<number, PendingPromise>();
  private isConnecting = false;
  private isConnected = false;
  private readonly options: Required<CDPClientOptions>;
  private reconnectionManager: ReconnectionManager;

  public constructor(options: CDPClientOptions = {}) {
    super();
    this.options = {
      connectionTimeout: options.connectionTimeout ?? 30000,
      requestTimeout: options.requestTimeout ?? 10000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectDelay: options.reconnectDelay ?? 1000,
      autoReconnect: options.autoReconnect ?? true,
    };
    this.reconnectionManager = new ReconnectionManager(
      this.options.maxReconnectAttempts,
      this.options.reconnectDelay,
      this,
    );
  }

  /**
   * Connect to a CDP endpoint
   *
   * @param url WebSocket URL (ws:// or wss://)
   * @throws {Error} If already connected or connection fails
   */
  public async connect(url: string): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      throw new Error('Client is already connected or connecting');
    }

    if (!isValidWebSocketUrl(url)) {
      throw new Error(
        'Invalid WebSocket URL. Must use ws:// or wss:// protocol',
      );
    }

    this.url = url;
    this.isConnecting = true;

    try {
      this.ws = await setupWebSocketConnection(
        url,
        this.options.connectionTimeout,
        () => {
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectionManager.reset();
          this.setupWebSocketHandlers();
          this.emit('connect');
        },
        () => {
          this.cleanup();
        },
        () => {
          if (this.isConnecting) {
            this.isConnecting = false;
          }
          this.handleDisconnection();
        },
      );
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Disconnect from the CDP endpoint
   */
  public async disconnect(): Promise<void> {
    // Disable reconnection for manual disconnect
    const originalAutoReconnect = this.options.autoReconnect;
    this.options.autoReconnect = false;

    this.reconnectionManager.cancel();

    if (this.ws && (this.isConnected || this.isConnecting)) {
      await disconnectWebSocket(this.ws, () => {
        this.cleanup();
        this.emit('disconnect');
      });
      this.options.autoReconnect = originalAutoReconnect;
      return;
    }

    this.cleanup();
    this.emit('disconnect');
    this.options.autoReconnect = originalAutoReconnect;
  }

  /**
   * Send a CDP method call
   *
   * @param method CDP method name (e.g., 'Runtime.evaluate')
   * @param params Method parameters
   * @returns Promise resolving to the method result
   * @throws {Error} If not connected or request fails
   */
  public async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Client is not connected');
    }

    const id = ++this.messageId;
    return sendCDPRequest<T>(
      this.ws,
      id,
      method,
      params,
      this.pendingPromises,
      this.options.requestTimeout,
    );
  }

  /**
   * Register an event handler for CDP events
   *
   * @param event Event name (e.g., 'Runtime.consoleAPICalled')
   * @param handler Event handler function
   */
  public on(event: string, handler: (params: unknown) => void): this {
    return super.on(event, handler);
  }

  /**
   * Remove an event handler
   *
   * @param event Event name
   * @param handler Event handler function to remove
   */
  public off(event: string, handler: (params: unknown) => void): this {
    return super.off(event, handler);
  }

  /**
   * Get connection status
   */
  public get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get the current WebSocket URL
   */
  public get connectionUrl(): string | null {
    return this.url;
  }

  /**
   * Initialize WebSocket event handlers after connection
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    setupWebSocketEventHandlers(
      this.ws,
      (data) => handleWebSocketMessage(data, this.pendingPromises, this),
      () => this.handleDisconnection(),
      (error) => this.emit('error', error),
    );
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(): void {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.isConnecting = false;

    // Reject all pending promises
    rejectAllPendingPromises(
      this.pendingPromises,
      new Error('Connection closed'),
    );

    if (wasConnected) {
      this.emit('disconnect');
    }

    // Attempt reconnection if enabled and we have a URL
    if (
      this.options.autoReconnect &&
      this.url &&
      this.reconnectionManager.canRetry()
    ) {
      this.reconnectionManager.scheduleReconnection(
        async () => {
          if (this.url) {
            await this.connect(this.url);
          }
        },
        () => {
          // Max attempts reached - no additional action needed
        },
      );
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.isConnected = false;
    this.isConnecting = false;

    cleanupWebSocket(this.ws);
    this.ws = null;

    rejectAllPendingPromises(
      this.pendingPromises,
      new Error('Client disconnected'),
    );
    this.reconnectionManager.cancel();
  }
}
