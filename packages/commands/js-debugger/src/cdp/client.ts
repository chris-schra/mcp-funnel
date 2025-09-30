import { EventEmitter } from 'events';
import { ICDPClient } from '../types/index.js';
import { WebSocketClient } from './websocket-client.js';
import { MessageHandler } from './message-handler.js';

/**
 * CDP Client configuration options.
 *
 * Configures connection behavior, timeouts, and automatic reconnection
 * for {@link CDPClient} instances.
 * @public
 * @see file:./client.ts:66 - Used in CDPClient constructor
 */
export interface CDPClientOptions {
  /**
   * Connection timeout in milliseconds
   * @defaultValue 30000
   */
  connectionTimeout?: number;

  /**
   * Request timeout in milliseconds
   * @defaultValue 10000
   */
  requestTimeout?: number;

  /**
   * Maximum reconnection attempts
   * @defaultValue 3
   */
  maxReconnectAttempts?: number;

  /**
   * Reconnection delay in milliseconds
   * @defaultValue 1000
   */
  reconnectDelay?: number;

  /**
   * Enable automatic reconnection
   * @defaultValue true
   */
  autoReconnect?: boolean;
}

/**
 * Chrome DevTools Protocol WebSocket client implementation.
 *
 * Provides a high-level JSON-RPC interface over WebSocket for communicating with:
 * - Node.js inspector endpoints (ws://localhost:9229/...)
 * - Browser DevTools endpoints (ws://localhost:9222/...)
 *
 * This client composes WebSocketClient (connection lifecycle) and MessageHandler
 * (JSON-RPC message correlation) into a unified CDP interface with proper event
 * forwarding and resource management.
 *
 * Key capabilities:
 * - Promise-based request/response handling with automatic message ID generation
 * - Type-safe CDP method invocation via {@link CDPClient.send}
 * - Event emission for all CDP events (e.g., 'Runtime.consoleAPICalled', 'Debugger.paused')
 * - Automatic reconnection with exponential backoff (configurable)
 * - Proper cleanup of pending promises on disconnect
 * - Connection state tracking via {@link CDPClient.connected} getter
 *
 * Architecture:
 * - {@link WebSocketClient}: Manages WebSocket lifecycle, reconnection, and low-level transport
 * - {@link MessageHandler}: Handles JSON-RPC message ID correlation and promise resolution
 * - {@link CDPClient}: Coordinates both components and provides unified CDP interface
 * @example Basic usage
 * ```typescript
 * const client = new CDPClient({
 *   connectionTimeout: 30000,
 *   requestTimeout: 10000,
 *   maxReconnectAttempts: 3,
 *   autoReconnect: true
 * });
 *
 * // Listen for CDP events
 * client.on('Runtime.consoleAPICalled', (params) => {
 *   console.log('Console output:', params);
 * });
 *
 * // Connect and send commands
 * await client.connect('ws://localhost:9229/abc123');
 * await client.send('Runtime.enable');
 * const result = await client.send('Runtime.evaluate', {
 *   expression: '2 + 2',
 *   returnByValue: true
 * });
 * ```
 * @example Error handling
 * ```typescript
 * client.on('error', (error) => {
 *   console.error('CDP error:', error);
 * });
 *
 * client.on('disconnect', () => {
 *   console.log('Connection lost - will auto-reconnect if enabled');
 * });
 *
 * try {
 *   await client.send('Debugger.pause');
 * } catch (error) {
 *   // Handle timeout or CDP protocol errors
 * }
 * ```
 * @public
 * @see file:./websocket-client.ts:47 - WebSocketClient implementation
 * @see file:./message-handler.ts:46 - MessageHandler implementation
 * @see file:../adapters/browser-adapter.ts:117 - Usage in BrowserAdapter
 */
export class CDPClient extends EventEmitter implements ICDPClient {
  private wsClient: WebSocketClient;
  private messageHandler: MessageHandler;
  private readonly options: Required<CDPClientOptions>;

  /**
   * Creates a new CDP client instance.
   *
   * Initializes WebSocketClient and MessageHandler with provided configuration.
   * Does not establish connection - call {@link connect} to connect to an endpoint.
   * @param options - Client configuration with timeouts and reconnection behavior
   */
  public constructor(options: CDPClientOptions = {}) {
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
   * Establishes connection to a CDP endpoint.
   *
   * Delegates to the underlying WebSocketClient to establish WebSocket connection.
   * Validates URL format and handles connection timeouts. The connection must succeed
   * before sending any CDP commands.
   * @param url - WebSocket URL to connect to (e.g., 'ws://localhost:9229/abc123')
   * @returns Promise that resolves when connection is established
   * @throws When already connected or connecting
   * @throws When URL format is invalid (not ws:// or wss://)
   * @throws When connection times out or fails
   * @see file:./websocket-client.ts:83 - WebSocketClient.connect implementation
   */
  public async connect(url: string): Promise<void> {
    return this.wsClient.connect(url);
  }

  /**
   * Disconnects from the CDP endpoint and cleans up resources.
   *
   * Rejects all pending promises, closes the WebSocket connection, and cleans up
   * event listeners. Safe to call even when not connected. Temporarily disables
   * automatic reconnection during disconnect.
   * @returns Promise that resolves when disconnect is complete
   * @see file:./websocket-client.ts:163 - WebSocketClient.disconnect implementation
   * @see file:./message-handler.ts - MessageHandler.rejectAllPendingPromises
   */
  public async disconnect(): Promise<void> {
    // Clean up pending promises before disconnecting
    this.messageHandler.rejectAllPendingPromises(
      new Error('Client disconnected'),
    );
    return this.wsClient.disconnect();
  }

  /**
   * Sends a CDP method call and waits for the response.
   *
   * This is the primary method for invoking Chrome DevTools Protocol commands.
   * The method validates connection state, delegates to MessageHandler for
   * request-response correlation, and returns a typed promise based on the
   * generic type parameter.
   *
   * Request lifecycle:
   * 1. Validates client is connected
   * 2. Generates unique message ID
   * 3. Sends JSON-RPC request via WebSocket
   * 4. Waits for response with timeout
   * 5. Returns result or throws error
   * @typeParam T - Expected type of the method result (defaults to `unknown`)
   * @param method - CDP method name (e.g., 'Runtime.evaluate', 'Debugger.setBreakpoint')
   * @param params - Optional method parameters as key-value pairs
   * @returns Promise resolving to the typed method result
   * @throws When client is not connected
   * @throws When request times out (after configured requestTimeout)
   * @throws When CDP returns an error response
   * @example Enabling domains
   * ```typescript
   * await client.send('Runtime.enable');
   * await client.send('Debugger.enable');
   * ```
   * @example Evaluating expressions
   * ```typescript
   * interface EvaluateResult {
   *   result: { type: string; value: unknown };
   * }
   *
   * const result = await client.send<EvaluateResult>('Runtime.evaluate', {
   *   expression: '2 + 2',
   *   returnByValue: true
   * });
   * console.log(result.result.value); // 4
   * ```
   * @example Setting breakpoints
   * ```typescript
   * const bp = await client.send('Debugger.setBreakpointByUrl', {
   *   lineNumber: 42,
   *   url: 'file:///path/to/script.js'
   * });
   * ```
   * @public
   * @see file:./message-handler.ts:167 - MessageHandler.sendRequest implementation
   * @see file:../adapters/browser-adapter.ts:168 - Usage example
   */
  public async send<T = unknown>(
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
   * Registers an event handler for CDP events.
   *
   * CDP events are emitted for debugger state changes like breakpoint hits,
   * script parsing, console output, exceptions, etc. Event names follow the
   * CDP convention of 'Domain.eventName' (e.g., 'Debugger.paused').
   *
   * The client also emits lifecycle events like 'connect', 'disconnect',
   * 'error', 'reconnecting', and 'reconnected'.
   * @param event - Event name to listen for
   * @param handler - Callback invoked when event occurs
   * @returns This client instance for method chaining
   * @example Listening for CDP domain events
   * ```typescript
   * client.on('Debugger.paused', (params) => {
   *   console.log('Execution paused:', params.reason);
   * });
   *
   * client.on('Runtime.consoleAPICalled', (params) => {
   *   console.log('Console output:', params.args);
   * });
   * ```
   * @example Listening for connection events
   * ```typescript
   * client.on('connect', () => console.log('Connected'));
   * client.on('disconnect', () => console.log('Disconnected'));
   * client.on('error', (error) => console.error('CDP error:', error));
   * ```
   * @public
   * @see file:./client.ts:191 - setupEventForwarding implementation
   */
  public on(event: string, handler: (params: unknown) => void): this {
    return super.on(event, handler);
  }

  /**
   * Removes an event handler previously registered with {@link on}.
   * @param event - Event name the handler was registered for
   * @param handler - The exact function reference passed to {@link on}
   * @returns This client instance for method chaining
   * @public
   */
  public off(event: string, handler: (params: unknown) => void): this {
    return super.off(event, handler);
  }

  /**
   * Connection status indicator.
   * @returns `true` when WebSocket is connected and ready for commands, `false` otherwise
   * @public
   * @see file:./websocket-client.ts:223 - WebSocketClient.connected implementation
   */
  public get connected(): boolean {
    return this.wsClient.connected;
  }

  /**
   * Current WebSocket connection URL.
   * @returns The URL passed to {@link connect}, or `null` if never connected
   * @public
   */
  public get connectionUrl(): string | null {
    return this.wsClient.connectionUrl;
  }

  /**
   * Number of requests awaiting responses.
   *
   * Useful for debugging and monitoring connection health. A growing count
   * may indicate network issues or debugger hangs.
   * @returns Count of in-flight requests
   * @public
   * @see file:./message-handler.ts:274 - MessageHandler.pendingRequestCount implementation
   */
  public get pendingRequestCount(): number {
    return this.messageHandler.pendingRequestCount;
  }

  /**
   * Sets up event forwarding between WebSocketClient, MessageHandler, and CDPClient.
   *
   * This method orchestrates the event flow between the three components:
   * 1. WebSocket lifecycle events (connect, disconnect, error, reconnecting) are forwarded from WebSocketClient
   * 2. CDP protocol events (e.g., 'Debugger.paused') are forwarded from MessageHandler
   * 3. WebSocket messages are routed to MessageHandler for parsing and correlation
   *
   * Event flow:
   * - WebSocketClient 'message' → MessageHandler.handleMessage → CDPClient (as CDP events)
   * - WebSocketClient lifecycle → CDPClient (as lifecycle events)
   * - MessageHandler errors → CDPClient 'error' event
   *
   * The implementation patches MessageHandler.emit to forward CDP events (identified by
   * containing a dot in the event name) to the main CDPClient EventEmitter.
   * @internal
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
