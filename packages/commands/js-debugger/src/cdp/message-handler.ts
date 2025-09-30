import { EventEmitter } from 'events';
import WebSocket from 'ws';

/**
 * JSON-RPC request message for CDP method calls.
 * @internal
 */
interface JsonRpcRequest {
  /** Unique request identifier for correlation with responses */
  id: number;
  /** CDP method name (e.g., 'Runtime.evaluate', 'Debugger.pause') */
  method: string;
  /** Optional method parameters as key-value pairs */
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response message from CDP method calls.
 *
 * Contains either a result (success) or error (failure), never both.
 * @typeParam T - The expected result type for successful responses
 * @internal
 */
interface JsonRpcResponse<T = unknown> {
  /** Request ID this response corresponds to */
  id: number;
  /** Successful method result (mutually exclusive with error) */
  result?: T;
  /** Error details if the method call failed */
  error?: {
    /** Error code following JSON-RPC conventions */
    code: number;
    /** Human-readable error description */
    message: string;
    /** Optional additional error context */
    data?: unknown;
  };
}

/**
 * JSON-RPC event notification from CDP.
 *
 * Events are unsolicited messages (no request ID) emitted by the debugger
 * for state changes like script parsing, breakpoint hits, or console output.
 * @internal
 */
interface JsonRpcEvent {
  /** Event name (e.g., 'Debugger.paused', 'Runtime.consoleAPICalled') */
  method: string;
  /** Event-specific payload */
  params: unknown;
}

/**
 * Tracks in-flight requests awaiting responses.
 *
 * Each pending promise has an associated timeout to prevent indefinite hangs
 * when the debugger fails to respond.
 * @typeParam T - The expected response type
 * @internal
 */
interface PendingPromise<T = unknown> {
  /** Resolves the request promise with the CDP response result */
  resolve: (value: T) => void;
  /** Rejects the request promise with an error */
  reject: (error: Error) => void;
  /** Timer that triggers rejection after the configured timeout */
  timeout: NodeJS.Timeout;
}

/**
 * Handles JSON-RPC message parsing, routing, and promise correlation for CDP communication.
 *
 * This class manages the low-level message protocol between the client and CDP endpoints,
 * translating between Promise-based APIs and JSON-RPC request-response-event patterns.
 *
 * Key responsibilities:
 * - Auto-incrementing message IDs for request correlation
 * - Timeout-based rejection for hanging requests
 * - Response routing to the correct pending promise
 * - Event emission for unsolicited CDP notifications
 * - Error handling for malformed or orphaned messages
 *
 * Architecture:
 * - Works in concert with WebSocketClient (transport) and CDPClient (API)
 * - Extends EventEmitter to forward CDP events to the client layer
 * - Maintains a Map of pending promises keyed by request ID
 * @example Basic usage (typically called by CDPClient)
 * ```typescript
 * const handler = new MessageHandler(10000); // 10s timeout
 *
 * // Send a request
 * const result = await handler.sendRequest<EvaluateResult>(
 *   'Runtime.evaluate',
 *   (data) => ws.send(data),
 *   { expression: '2 + 2' }
 * );
 *
 * // Handle incoming messages
 * ws.on('message', (data) => handler.handleMessage(data));
 *
 * // Listen for CDP events
 * handler.on('Debugger.paused', (params) => console.log('Paused:', params));
 * ```
 * @public
 * @see file:./client.ts:84 - CDPClient usage of MessageHandler
 * @see file:./websocket-client.ts - WebSocketClient transport layer
 */
export class MessageHandler extends EventEmitter {
  /** Auto-incrementing ID for the next outgoing request */
  private messageId = 0;

  /** Map of request ID to pending promise for response correlation */
  private pendingPromises = new Map<number, PendingPromise>();

  /**
   * Creates a new MessageHandler.
   * @param requestTimeout - Milliseconds before timing out pending requests
   */
  public constructor(private readonly requestTimeout: number) {
    super();
  }

  /**
   * Sends a CDP method call and returns a promise that resolves with the response.
   *
   * This method handles the complete request lifecycle:
   * 1. Generates a unique request ID
   * 2. Registers a pending promise with timeout
   * 3. Serializes and sends the JSON-RPC request via the provided send function
   * 4. Returns a promise that resolves when the response arrives or rejects on timeout/error
   *
   * The promise is resolved/rejected by {@link handleResponse} when the corresponding
   * response message arrives.
   * @typeParam T - Expected type of the CDP method result
   * @param method - CDP method name (e.g., 'Runtime.evaluate', 'Debugger.setBreakpoint')
   * @param sendFn - Function to transmit the serialized request (typically WebSocket.send)
   * @param params - Optional method parameters as key-value pairs
   * @throws When the request times out after the configured timeout period
   * @throws When the send function throws (e.g., WebSocket disconnected)
   * @throws When the CDP response contains an error field (rejected with CDP error details)
   * @example
   * ```typescript
   * // Evaluate JavaScript in the runtime
   * const result = await handler.sendRequest<{ result: { value: number } }>(
   *   'Runtime.evaluate',
   *   (data) => webSocket.send(data),
   *   { expression: '2 + 2', returnByValue: true }
   * );
   * console.log(result.result.value); // 4
   * ```
   * @public
   * @see file:./client.ts:124 - CDPClient.send usage
   */
  public sendRequest<T = unknown>(
    method: string,
    sendFn: (data: string) => void,
    params?: Record<string, unknown>,
  ): Promise<T> {
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
            `Request timeout after ${this.requestTimeout}ms for method: ${method}`,
          ),
        );
      }, this.requestTimeout);

      this.pendingPromises.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      try {
        sendFn(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingPromises.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Parses and routes incoming CDP messages to the appropriate handler.
   *
   * This is the main entry point for all incoming WebSocket data. It determines whether
   * the message is a response (has 'id' field) or an event (has 'method' field without 'id')
   * and dispatches accordingly.
   *
   * Message routing:
   * - Messages with 'id': Routed to {@link handleResponse} to resolve pending promises
   * - Messages with 'method': Routed to {@link handleEvent} and emitted as EventEmitter events
   * - Invalid JSON: Emits an 'error' event
   * @param data - Raw WebSocket data (Buffer, ArrayBuffer, or string)
   * @example
   * ```typescript
   * // Typically called by WebSocketClient
   * wsClient.on('message', (data) => {
   *   messageHandler.handleMessage(data);
   * });
   * ```
   * @public
   * @see file:./client.ts:202 - CDPClient WebSocket message handling
   */
  public handleMessage(data: WebSocket.RawData): void {
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
   * Rejects all in-flight requests with a common error.
   *
   * Used during cleanup when the connection is lost or closed, ensuring no promises
   * are left hanging indefinitely. Clears all timeout timers and removes all pending
   * promises from the tracking map.
   *
   * Common scenarios:
   * - WebSocket connection closed unexpectedly
   * - Client disconnect initiated by user
   * - Fatal protocol error requiring connection reset
   * @param error - Error to reject all pending promises with
   * @example
   * ```typescript
   * // Called during disconnect cleanup
   * wsClient.on('disconnect', () => {
   *   messageHandler.rejectAllPendingPromises(new Error('Connection closed'));
   * });
   * ```
   * @public
   * @see file:./client.ts:103 - CDPClient disconnect cleanup
   * @see file:./client.ts:178 - CDPClient reconnection cleanup
   */
  public rejectAllPendingPromises(error: Error): void {
    for (const pending of this.pendingPromises.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingPromises.clear();
  }

  /**
   * Number of requests awaiting responses.
   *
   * Useful for debugging and monitoring connection health. A growing count
   * may indicate network issues or debugger hangs.
   * @returns The count of pending requests
   * @public
   */
  public get pendingRequestCount(): number {
    return this.pendingPromises.size;
  }

  /**
   * Routes JSON-RPC responses to their corresponding pending promises.
   *
   * Correlates responses with requests using the request ID, then either resolves
   * the promise with the result or rejects it with the error. Cleans up the timeout
   * timer and removes the promise from the pending map.
   *
   * Orphaned responses (no matching pending promise) emit an 'error' event but don't
   * throw, allowing the connection to remain stable.
   * @param response - The CDP response message
   * @internal
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
      const error = new Error(response.error.message) as Error & {
        code?: number;
        data?: unknown;
      };
      error.code = response.error.code;
      if ('data' in response.error) {
        error.data = response.error.data;
      }
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Emits CDP event notifications through the EventEmitter interface.
   *
   * Events are unsolicited messages from the debugger (e.g., 'Debugger.paused',
   * 'Runtime.consoleAPICalled') that don't correspond to any request. They're
   * emitted on the MessageHandler which forwards them to the CDPClient.
   *
   * The 'Debugger.scriptParsed' event is filtered from debug logging because it's
   * extremely noisy during application startup.
   * @param event - The CDP event notification
   * @internal
   */
  private handleEvent(event: JsonRpcEvent): void {
    // Filter out noisy events for cleaner debugging
    if (event.method !== 'Debugger.scriptParsed') {
      console.debug('handleEvent', event.method, event.params);
    }
    this.emit(event.method, event.params);
  }
}
