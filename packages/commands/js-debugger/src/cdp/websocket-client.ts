import { EventEmitter } from 'events';
import WebSocket from 'ws';

/**
 * WebSocket connection management for CDP clients
 *
 * Handles:
 * - WebSocket lifecycle (connect, disconnect, reconnect)
 * - Connection state management
 * - Automatic reconnection with exponential backoff
 * - Resource cleanup
 */
export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private isConnecting = false;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly options: {
      connectionTimeout: number;
      maxReconnectAttempts: number;
      reconnectDelay: number;
      autoReconnect: boolean;
    },
  ) {
    super();
  }

  /**
   * Connect to a WebSocket endpoint
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
   * Disconnect from the WebSocket endpoint
   */
  async disconnect(): Promise<void> {
    // Disable reconnection for manual disconnect
    const originalAutoReconnect = this.options.autoReconnect;
    this.options.autoReconnect = false;

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
          this.options.autoReconnect = originalAutoReconnect;
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
    this.options.autoReconnect = originalAutoReconnect;
  }

  /**
   * Send data through the WebSocket
   */
  send(data: string): void {
    if (!this.ws || !this.isConnected) {
      throw new Error('WebSocket is not connected');
    }

    this.ws.send(data);
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

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.emit('message', data);
    });
    this.ws.on('close', this.handleDisconnection.bind(this));
    this.ws.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(): void {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.isConnecting = false;

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
