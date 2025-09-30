import { EventEmitter } from 'events';
import WebSocket from 'ws';

/**
 * WebSocket connection management for CDP clients.
 *
 * Provides robust WebSocket connection handling with automatic reconnection,
 * exponential backoff, and comprehensive lifecycle management. Used internally
 * by CDPClient to manage the underlying WebSocket transport layer.
 *
 * Key capabilities:
 * - WebSocket lifecycle (connect, disconnect, reconnect)
 * - Connection state management with thread-safe flags
 * - Automatic reconnection with exponential backoff
 * - Proper resource cleanup and event listener removal
 * - URL validation ensuring ws:// or wss:// protocols
 *
 * Events emitted:
 * - `connect`: Fired when connection is successfully established
 * - `disconnect`: Fired when connection is closed (manual or unexpected)
 * - `message`: Fired when WebSocket receives data (payload is WebSocket.RawData)
 * - `error`: Fired on connection errors or when max reconnect attempts reached
 * - `reconnecting`: Fired before each reconnection attempt (payload: \{attempt: number, delay: number\})
 * - `reconnected`: Fired after successful reconnection
 * @example Basic usage
 * ```typescript
 * const client = new WebSocketClient({
 *   connectionTimeout: 30000,
 *   maxReconnectAttempts: 3,
 *   reconnectDelay: 1000,
 *   autoReconnect: true
 * });
 *
 * client.on('connect', () => console.log('Connected'));
 * client.on('disconnect', () => console.log('Disconnected'));
 * client.on('message', (data) => console.log('Received:', data));
 *
 * await client.connect('ws://localhost:9229/abc123');
 * client.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
 * await client.disconnect();
 * ```
 * @see file:./client.ts:77 - Used by CDPClient for WebSocket transport
 * @internal
 */
export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private isConnecting = false;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  public constructor(
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
   * Establishes WebSocket connection to CDP endpoint.
   *
   * Validates URL format (must be ws:// or wss://), creates WebSocket connection,
   * and waits for successful connection or timeout. Connection state prevents
   * multiple simultaneous connection attempts.
   * @param url - WebSocket URL to connect to (e.g., 'ws://localhost:9229/abc123')
   * @returns Promise that resolves when connection is established
   * @throws Error When already connected or connecting
   * @throws Error When URL format is invalid (not ws:// or wss://)
   * @throws Error When connection times out (after connectionTimeout ms)
   * @throws Error When WebSocket connection fails
   * @see file:./client.ts:94 - Called by CDPClient.connect()
   */
  public async connect(url: string): Promise<void> {
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
   * Gracefully disconnects from WebSocket endpoint.
   *
   * Temporarily disables automatic reconnection, cancels any pending reconnection
   * attempts, closes the WebSocket connection, and cleans up resources. After
   * disconnect completes, the autoReconnect setting is restored to its original value.
   *
   * Safe to call even when not connected - will clean up and emit disconnect event.
   * @returns Promise that resolves when disconnect is complete
   * @see file:./client.ts:101 - Called by CDPClient.disconnect()
   */
  public async disconnect(): Promise<void> {
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
   * Sends string data through the WebSocket connection.
   *
   * Used for sending JSON-RPC messages to the CDP endpoint. Must be connected
   * before calling - will throw if not connected.
   * @param data - String data to send (typically JSON-serialized CDP protocol message)
   * @throws Error When WebSocket is not connected
   * @see file:./client.ts:126 - Called by CDPClient.send() via callback
   */
  public send(data: string): void {
    if (!this.ws || !this.isConnected) {
      throw new Error('WebSocket is not connected');
    }

    this.ws.send(data);
  }

  /**
   * Connection status indicator.
   * @returns `true` when WebSocket is open and ready to send/receive, `false` otherwise
   */
  public get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Current WebSocket connection URL.
   * @returns The URL passed to {@link connect}, or `null` if never connected
   */
  public get connectionUrl(): string | null {
    return this.url;
  }

  /**
   * Attaches WebSocket event listeners after successful connection.
   *
   * Sets up handlers for:
   * - 'message': Emits received data to client listeners
   * - 'close': Triggers disconnection handling and potential reconnection
   * - 'error': Forwards errors to client listeners
   *
   * Called once after connection is established (on 'open' event).
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
   * Handles WebSocket disconnection and initiates reconnection if configured.
   *
   * Updates connection state flags, emits 'disconnect' event if previously connected,
   * and schedules automatic reconnection if enabled and within retry limits.
   *
   * Called by WebSocket 'close' event handler.
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
   * Schedules automatic reconnection attempt with exponential backoff.
   *
   * Calculates delay as: `reconnectDelay * 2^(attempt - 1)`, increments attempt counter,
   * emits 'reconnecting' event, and schedules connection attempt. If reconnection fails,
   * will recursively schedule another attempt until max attempts reached.
   *
   * Emits 'error' event with "Max reconnection attempts reached" when all attempts exhausted.
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
   * Cleans up all resources and resets connection state.
   *
   * Resets connection flags, removes all WebSocket event listeners, closes the
   * WebSocket if still open, clears reconnection timeout, and nullifies references.
   * Safe to call multiple times.
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
   * Validates WebSocket URL format using URL parser.
   * @param url - URL string to validate
   * @returns `true` if URL uses ws:// or wss:// protocol, `false` otherwise (including malformed URLs)
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
