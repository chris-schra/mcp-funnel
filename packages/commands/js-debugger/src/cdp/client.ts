import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ICDPClient } from '../types.js';

/**
 * JSON-RPC message types for the Chrome DevTools Protocol
 */
interface JsonRpcRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T = unknown> {
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcEvent {
  method: string;
  params: unknown;
}

/**
 * Pending promise tracking for request-response correlation
 */
interface PendingPromise<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

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
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
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
  }

  /**
   * Connect to a CDP endpoint
   *
   * @param url WebSocket URL (ws:// or wss://)
   * @throws {Error} If already connected or connection fails
   */
  async connect(url: string): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      throw new Error('Client is already connected or connecting');
    }

    if (!this.isValidWebSocketUrl(url)) {
      throw new Error(
        'Invalid WebSocket URL. Must use ws:// or wss:// protocol',
      );
    }

    this.url = url;
    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanup();
        reject(
          new Error(
            `Connection timeout after ${this.options.connectionTimeout}ms`,
          ),
        );
      }, this.options.connectionTimeout);

      try {
        this.ws = new WebSocket(url);

        const onOpen = () => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.setupWebSocketHandlers();
          this.emit('connect');
          resolve();
        };

        const onError = (error: Error) => {
          clearTimeout(timeout);
          this.cleanup();
          reject(new Error(`Failed to connect to ${url}: ${error.message}`));
        };

        const onClose = () => {
          clearTimeout(timeout);
          if (this.isConnecting) {
            // Connection failed during initial connection
            reject(
              new Error(
                `Connection closed during initial connection to ${url}`,
              ),
            );
          }
          this.handleDisconnection();
        };

        this.ws.once('open', onOpen);
        this.ws.once('error', onError);
        this.ws.once('close', onClose);
      } catch (error) {
        clearTimeout(timeout);
        this.cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Disconnect from the CDP endpoint
   */
  async disconnect(): Promise<void> {
    // Disable reconnection for manual disconnect
    const originalAutoReconnect = this.options.autoReconnect;
    (this.options as any).autoReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws && (this.isConnected || this.isConnecting)) {
      return new Promise<void>((resolve) => {
        const cleanup = () => {
          this.cleanup();
          this.emit('disconnect');
          // Restore original setting after disconnect
          (this.options as any).autoReconnect = originalAutoReconnect;
          resolve();
        };

        if (this.ws!.readyState === WebSocket.OPEN) {
          this.ws!.once('close', cleanup);
          this.ws!.close();
        } else {
          cleanup();
        }
      });
    }

    this.cleanup();
    this.emit('disconnect');
    // Restore original setting
    (this.options as any).autoReconnect = originalAutoReconnect;
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
    if (!this.isConnected || !this.ws) {
      throw new Error('Client is not connected');
    }

    const id = ++this.messageId;
    const request: JsonRpcRequest = { id, method };

    if (params && Object.keys(params).length > 0) {
      request.params = params;
    }

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingPromises.delete(id);
        reject(
          new Error(
            `Request timeout after ${this.options.requestTimeout}ms for method: ${method}`,
          ),
        );
      }, this.options.requestTimeout);

      this.pendingPromises.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      try {
        this.ws!.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingPromises.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
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
    return this.isConnected;
  }

  /**
   * Get the current WebSocket URL
   */
  get connectionUrl(): string | null {
    return this.url;
  }

  /**
   * Initialize WebSocket event handlers after connection
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('message', this.handleMessage.bind(this));
    this.ws.on('close', this.handleDisconnection.bind(this));
    this.ws.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.RawData): void {
    try {
      const message = JSON.parse(data.toString()) as
        | JsonRpcResponse
        | JsonRpcEvent;

      if ('id' in message) {
        // Response to a method call
        this.handleResponse(message);
      } else if ('method' in message) {
        // Event notification
        this.handleEvent(message);
      }
    } catch (error) {
      this.emit(
        'error',
        new Error(
          `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Handle JSON-RPC responses
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingPromises.get(response.id);
    if (!pending) {
      this.emit(
        'error',
        new Error(`Received response for unknown request ID: ${response.id}`),
      );
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingPromises.delete(response.id);

    if (response.error) {
      const error = new Error(response.error.message);
      (error as any).code = response.error.code;
      (error as any).data = response.error.data;
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle CDP events
   */
  private handleEvent(event: JsonRpcEvent): void {
    this.emit(event.method, event.params);
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(): void {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.isConnecting = false;

    // Reject all pending promises
    this.rejectPendingPromises(new Error('Connection closed'));

    if (wasConnected) {
      this.emit('disconnect');
    }

    // Attempt reconnection if enabled and we have a URL
    if (
      this.options.autoReconnect &&
      this.url &&
      this.reconnectAttempts < this.options.maxReconnectAttempts
    ) {
      this.scheduleReconnection();
    }
  }

  /**
   * Schedule automatic reconnection with exponential backoff
   */
  private scheduleReconnection(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay =
      this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimeout = setTimeout(async () => {
      if (!this.url) return;

      try {
        await this.connect(this.url);
        this.emit('reconnected');
      } catch (error) {
        this.emit(
          'error',
          new Error(
            `Reconnection attempt ${this.reconnectAttempts} failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );

        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnection();
        } else {
          this.emit('error', new Error('Max reconnection attempts reached'));
        }
      }
    }, delay);
  }

  /**
   * Reject all pending promises with the given error
   */
  private rejectPendingPromises(error: Error): void {
    for (const [id, pending] of this.pendingPromises) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingPromises.clear();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.isConnected = false;
    this.isConnecting = false;

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState !== WebSocket.CLOSED) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.rejectPendingPromises(new Error('Client disconnected'));

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Validate WebSocket URL format
   */
  private isValidWebSocketUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    } catch {
      return false;
    }
  }
}
