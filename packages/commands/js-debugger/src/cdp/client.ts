import { EventEmitter } from 'events';
import { ICDPClient } from '../types/index.js';
import { WebSocketClient } from './websocket-client.js';
import { MessageHandler } from './message-handler.js';

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
 *
 * Architecture:
 * - WebSocketClient: Handles connection lifecycle and WebSocket management
 * - MessageHandler: Manages JSON-RPC message parsing and promise correlation
 * - CDPClient: Provides high-level CDP interface and event coordination
 */
export class CDPClient extends EventEmitter implements ICDPClient {
  private wsClient: WebSocketClient;
  private messageHandler: MessageHandler;
  private readonly options: Required<CDPClientOptions>;

  constructor(options: CDPClientOptions = {}) {
    super();
    this.options = {
      connectionTimeout: options.connectionTimeout ?? 30000,
      requestTimeout: options.requestTimeout ?? 10000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectDelay: options.reconnectDelay ?? 1000,
      autoReconnect: options.autoReconnect ?? true,
    };

    // Initialize composed components
    this.wsClient = new WebSocketClient({
      connectionTimeout: this.options.connectionTimeout,
      maxReconnectAttempts: this.options.maxReconnectAttempts,
      reconnectDelay: this.options.reconnectDelay,
      autoReconnect: this.options.autoReconnect,
    });

    this.messageHandler = new MessageHandler(this.options.requestTimeout);

    this.setupEventForwarding();
  }

  /**
   * Connect to a CDP endpoint
   *
   * @param url WebSocket URL (ws:// or wss://)
   * @throws {Error} If already connected or connection fails
   */
  async connect(url: string): Promise<void> {
    return this.wsClient.connect(url);
  }

  /**
   * Disconnect from the CDP endpoint
   */
  async disconnect(): Promise<void> {
    // Clean up pending promises before disconnecting
    this.messageHandler.rejectAllPendingPromises(
      new Error('Client disconnected'),
    );
    return this.wsClient.disconnect();
  }

  /**
   * Send a CDP method call
   *
   * @param method CDP method name (e.g., 'Runtime.evaluate')
   * @param params Method parameters
   * @returns Promise resolving to the method result
   * @throws {Error} If not connected or request fails
   */
  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.connected) {
      throw new Error('Client is not connected');
    }

    return this.messageHandler.sendRequest<T>(
      method,
      (data) => this.wsClient.send(data),
      params,
    );
  }

  /**
   * Register an event handler for CDP events
   *
   * @param event Event name (e.g., 'Runtime.consoleAPICalled')
   * @param handler Event handler function
   */
  on(event: string, handler: (params: unknown) => void): this {
    return super.on(event, handler);
  }

  /**
   * Remove an event handler
   *
   * @param event Event name
   * @param handler Event handler function to remove
   */
  off(event: string, handler: (params: unknown) => void): this {
    return super.off(event, handler);
  }

  /**
   * Get connection status
   */
  get connected(): boolean {
    return this.wsClient.connected;
  }

  /**
   * Get the current WebSocket URL
   */
  get connectionUrl(): string | null {
    return this.wsClient.connectionUrl;
  }

  /**
   * Get the count of pending requests
   */
  get pendingRequestCount(): number {
    return this.messageHandler.pendingRequestCount;
  }

  /**
   * Set up event forwarding between components
   */
  private setupEventForwarding(): void {
    // Forward WebSocket events
    this.wsClient.on('connect', () => this.emit('connect'));
    this.wsClient.on('disconnect', () => {
      // Clean up pending promises on disconnect
      this.messageHandler.rejectAllPendingPromises(
        new Error('Connection closed'),
      );
      this.emit('disconnect');
    });
    this.wsClient.on('reconnecting', (data) => this.emit('reconnecting', data));
    this.wsClient.on('reconnected', () => this.emit('reconnected'));
    this.wsClient.on('error', (error) => this.emit('error', error));

    // Forward message handler events (CDP events)
    this.messageHandler.on('error', (error) => this.emit('error', error));

    // Forward all CDP events from message handler
    this.messageHandler.on('newListener', (event, listener) => {
      // When someone listens for a CDP event on this client,
      // make sure we forward it from the message handler
      if (event.includes('.')) {
        // CDP events contain dots (e.g., 'Runtime.consoleAPICalled')
        this.messageHandler.on(event, listener);
      }
    });

    // Handle incoming WebSocket messages
    this.wsClient.on('message', (data) => {
      this.messageHandler.handleMessage(data);
    });

    // Forward all CDP method events from message handler
    const originalEmit = this.messageHandler.emit.bind(this.messageHandler);
    this.messageHandler.emit = (event: string | symbol, ...args: unknown[]) => {
      const result = originalEmit(event, ...args);
      // Forward CDP events (those with dots in the name) to the main client
      if (typeof event === 'string' && event.includes('.')) {
        this.emit(event, ...args);
      }
      return result;
    };
  }
}
