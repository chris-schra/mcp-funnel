/* eslint-disable max-lines */

import Emittery from 'emittery';
import WebSocket from 'ws';
import type { ITypedCDPClient } from '../../types/index.js';
import type {
  CDPDebuggerPausedParams,
  CDPConsoleAPICalledParams,
  CDPExceptionThrownParams,
} from '../../cdp/types.js';

/**
 * CDP Message interface matching Chrome DevTools Protocol format.
 *
 * Represents the structure of messages exchanged over the WebSocket connection
 * with Chrome DevTools Protocol. Includes both command/response messages (with id)
 * and event notifications (without id).
 * @internal
 */
interface CDPMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string; code?: number; data?: unknown };
}

/**
 * Typed CDP events map for Emittery-based event handling.
 *
 * Defines the event types and their associated parameter types for type-safe
 * event subscription. Events use optional data types to handle cases where
 * CDP may not always provide parameters.
 * @internal
 * @see file:../../cdp/types.ts - CDP type definitions
 */
interface CDPEvents {
  'Debugger.paused': CDPDebuggerPausedParams | undefined;
  'Debugger.resumed': undefined;
  'Debugger.scriptParsed': Record<string, unknown> | undefined;
  'Debugger.breakpointResolved': Record<string, unknown> | undefined;
  'Runtime.consoleAPICalled': CDPConsoleAPICalledParams | undefined;
  'Runtime.exceptionThrown': CDPExceptionThrownParams | undefined;
  error: Error;
  disconnect: undefined;
  unexpectedMessage: CDPMessage;
}

/**
 * CDP Connection Handler for Chrome DevTools Protocol communication.
 *
 * Manages WebSocket connections to CDP endpoints, handles message correlation
 * via request/response ID tracking, and provides both typed and untyped event
 * handling interfaces. Implements the ITypedCDPClient interface for compatibility
 * with debug adapters while offering enhanced type-safe event subscription through
 * Emittery.
 *
 * Key features:
 * - Automatic message ID generation and correlation
 * - Promise-based command execution with 10-second timeout
 * - Type-safe event handling via onTyped() method
 * - Backward-compatible untyped on()/off() interface
 * - Automatic cleanup of pending requests on disconnect
 * @example Basic usage
 * ```typescript
 * const cdp = new CDPConnection();
 * await cdp.connect('ws://localhost:9229/devtools/page/ABC123');
 *
 * // Type-safe event handling
 * cdp.onTyped('Debugger.paused', (params) => {
 *   console.log('Paused:', params?.reason);
 * });
 *
 * // Send commands
 * await cdp.send('Debugger.enable');
 * await cdp.send('Debugger.pause');
 * ```
 * @example Backward-compatible interface
 * ```typescript
 * const cdp = new CDPConnection();
 * await cdp.connect(wsUrl);
 *
 * // Untyped event handling (ITypedCDPClient interface)
 * cdp.on('Debugger.paused', (params: unknown) => {
 *   const pausedParams = params as CDPDebuggerPausedParams;
 *   console.log('Paused:', pausedParams.reason);
 * });
 * ```
 * @public
 * @see file:../../types/adapter.ts:67 - ITypedCDPClient interface definition
 * @see file:./cdp-connection-demo.ts - Usage examples
 */
export class CDPConnection implements ITypedCDPClient {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private pendingMessages = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private connected = false;
  private emitter = new Emittery<CDPEvents>();

  public constructor() {
    // No super() call needed for composition
  }

  /**
   * Establishes WebSocket connection to a CDP endpoint.
   *
   * Opens a WebSocket connection to the specified Chrome DevTools Protocol URL
   * and sets up message handling. Rejects if already connected or if the connection
   * fails to establish.
   * @param wsUrl - WebSocket URL in format ws://host:port/devtools/page/target-id
   * @throws {Error} When already connected to CDP
   * @throws {Error} When WebSocket connection fails with the underlying error message
   * @example
   * ```typescript
   * const cdp = new CDPConnection();
   * await cdp.connect('ws://localhost:9229/devtools/page/ABC123');
   * console.log('Connected:', cdp.isConnected()); // true
   * ```
   * @public
   */
  public async connect(wsUrl: string): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected to CDP');
    }

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      const onOpen = () => {
        this.connected = true;
        this.setupMessageHandling();
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(new Error(`Failed to connect to CDP: ${error.message}`));
      };

      const cleanup = () => {
        this.ws?.off('open', onOpen);
        this.ws?.off('error', onError);
      };

      this.ws.once('open', onOpen);
      this.ws.once('error', onError);
    });
  }

  /**
   * Closes WebSocket connection and cleans up pending requests.
   *
   * Gracefully closes the WebSocket connection, rejects all pending messages with
   * a connection closed error, and resets internal state. Safe to call multiple
   * times or when not connected.
   * @returns Promise that resolves when disconnection is complete
   * @example
   * ```typescript
   * await cdp.disconnect();
   * console.log('Disconnected:', !cdp.isConnected()); // true
   * ```
   * @public
   */
  public async disconnect(): Promise<void> {
    if (!this.connected || !this.ws) {
      return;
    }

    // Reject all pending messages
    const pendingError = new Error('Connection closed');
    for (const [, { reject, timeout }] of this.pendingMessages) {
      clearTimeout(timeout);
      reject(pendingError);
    }
    this.pendingMessages.clear();

    return new Promise<void>((resolve) => {
      if (!this.ws) {
        resolve();
        return;
      }

      const onClose = () => {
        this.connected = false;
        this.ws = null;
        resolve();
      };

      this.ws.once('close', onClose);
      this.ws.close();
    });
  }

  /**
   * Sends a CDP command and waits for the response.
   *
   * Executes a Chrome DevTools Protocol command with automatic message ID generation,
   * request/response correlation, and timeout handling. The promise resolves with the
   * command result or rejects on error or timeout (10 seconds).
   * @param method - CDP method name (e.g., 'Debugger.enable', 'Runtime.evaluate')
   * @param params - Optional parameters for the command
   * @returns Promise resolving to the command result with type T
   * @throws {Error} When not connected to CDP
   * @throws {Error} When command times out after 10 seconds
   * @throws {Error} When CDP returns an error response
   * @example Enable debugger
   * ```typescript
   * await cdp.send('Debugger.enable');
   * ```
   * @example Evaluate expression
   * ```typescript
   * interface EvalResult {
   *   result: { type: string; value: unknown };
   * }
   * const result = await cdp.send<EvalResult>('Runtime.evaluate', {
   *   expression: '2 + 2'
   * });
   * console.log(result.result.value); // 4
   * ```
   * @public
   */
  public async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected to CDP');
    }

    return new Promise<T>((resolve, reject) => {
      const id = this.messageId++;

      const timeout = setTimeout(() => {
        this.pendingMessages.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, 10000); // 10 second timeout

      this.pendingMessages.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
      });

      const message: CDPMessage = { id, method, params };
      this.ws!.send(JSON.stringify(message));
    });
  }

  /**
   * Registers a type-safe event listener for CDP events.
   *
   * Provides type-safe event subscription with automatic parameter type inference
   * based on the event name. The handler receives properly typed parameters for
   * known CDP events.
   * @param event - CDP event name (e.g., 'Debugger.paused', 'Runtime.consoleAPICalled')
   * @param handler - Event handler receiving typed parameters for the event
   * @returns Unsubscribe function to remove this specific listener
   * @example
   * ```typescript
   * const unsubscribe = cdp.onTyped('Debugger.paused', (params) => {
   *   // params is automatically typed as CDPDebuggerPausedParams | undefined
   *   console.log('Paused at:', params?.callFrames[0]?.location);
   * });
   *
   * // Later, remove the listener
   * unsubscribe();
   * ```
   * @public
   */
  public onTyped<K extends keyof CDPEvents>(
    event: K,
    handler: (params: CDPEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  /**
   * Registers an untyped event listener for CDP events.
   *
   * Implements the ITypedCDPClient interface for backward compatibility with existing
   * code. Unlike onTyped(), this method does not provide automatic type inference and
   * requires manual type casting of parameters.
   * @param event - CDP event name as a string
   * @param handler - Event handler receiving untyped parameters
   * @remarks
   * Prefer using onTyped() for new code to benefit from type safety. This method
   * exists for ITypedCDPClient interface compatibility.
   * @example
   * ```typescript
   * cdp.on('Debugger.paused', (params: unknown) => {
   *   const pausedParams = params as CDPDebuggerPausedParams;
   *   console.log('Paused:', pausedParams.reason);
   * });
   * ```
   * @public
   * @see file:../../types/adapter.ts:62 - ICDPClient.on() interface
   */
  public on(event: string, handler: (params?: unknown) => void): void {
    // Handle the special case of Debugger.resumed which has no params
    if (event === 'Debugger.resumed') {
      this.emitter.on('Debugger.resumed', () => {
        handler?.();
      });
    } else {
      this.emitter.on(event as keyof CDPEvents, (params) => {
        handler(params as unknown);
      });
    }
  }

  /**
   * Removes a type-safe event listener for CDP events.
   *
   * Removes a previously registered typed event handler. The handler function
   * reference must match the one used in onTyped() for successful removal.
   * @param event - CDP event name matching the original subscription
   * @param handler - Exact handler function reference to remove
   * @example
   * ```typescript
   * const handler = (params: CDPEvents['Debugger.paused']) => {
   *   console.log('Paused');
   * };
   * cdp.onTyped('Debugger.paused', handler);
   *
   * // Later, remove using the same handler reference
   * cdp.offTyped('Debugger.paused', handler);
   * ```
   * @public
   */
  public offTyped<K extends keyof CDPEvents>(
    event: K,
    handler: (params: CDPEvents[K]) => void,
  ): void {
    this.emitter.off(event, handler);
  }

  /**
   * Removes an untyped event listener for CDP events.
   *
   * Implements the ITypedCDPClient interface for backward compatibility. The handler
   * function reference must match the one used in on() for successful removal.
   * @param event - CDP event name as a string
   * @param handler - Exact handler function reference to remove
   * @remarks
   * Due to Emittery's requirement for exact function reference matching, wrapped
   * handlers may not be removable. Consider using onTyped() with the returned
   * unsubscribe function for more reliable cleanup.
   * @public
   * @see file:../../types/adapter.ts:63 - ICDPClient.off() interface
   */
  public off(event: string, handler: (params?: unknown) => void): void {
    // Note: For Emittery, we need to pass the exact same handler function
    // This is a limitation of the current approach
    this.emitter.off(
      event as keyof CDPEvents,
      handler as (params: CDPEvents[keyof CDPEvents]) => void,
    );
  }

  /**
   * Checks if currently connected to a CDP endpoint.
   * @returns true if WebSocket connection is active, false otherwise
   * @example
   * ```typescript
   * if (cdp.isConnected()) {
   *   await cdp.send('Debugger.pause');
   * }
   * ```
   * @public
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Sets up WebSocket message and event handling.
   *
   * Registers listeners for incoming CDP messages, WebSocket errors, and connection
   * close events. Parses JSON messages and routes them to handleMessage(). Emits
   * error and disconnect events as appropriate.
   * @internal
   */
  private setupMessageHandling(): void {
    if (!this.ws) {
      return;
    }

    this.ws.on('message', (data) => {
      try {
        const message: CDPMessage = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        this.emitter.emit(
          'error',
          new Error(`Failed to parse CDP message: ${error}`),
        );
      }
    });

    this.ws.on('error', (error) => {
      this.emitter.emit('error', error);
    });

    this.ws.on('close', () => {
      this.connected = false;
      this.emitter.emit('disconnect', undefined);

      // Reject all pending messages
      const closeError = new Error('WebSocket connection closed');
      for (const [, { reject, timeout }] of this.pendingMessages) {
        clearTimeout(timeout);
        reject(closeError);
      }
      this.pendingMessages.clear();
    });
  }

  /**
   * Routes incoming CDP messages to appropriate handlers.
   *
   * Handles three types of CDP messages:
   * 1. Command responses (has id, matches pending message) - resolves/rejects promise
   * 2. Event notifications (has method, no id) - emits typed event
   * 3. Unexpected messages - emits unexpectedMessage event
   *
   * Known CDP events are emitted with proper type casting. Unknown events are logged
   * as warnings, except for expected events like Runtime.executionContextCreated which
   * are silently ignored.
   * @param message - Parsed CDP message from WebSocket
   * @internal
   */
  private handleMessage(message: CDPMessage): void {
    // Handle response to a command we sent
    if (message.id !== undefined && this.pendingMessages.has(message.id)) {
      const pending = this.pendingMessages.get(message.id)!;
      this.pendingMessages.delete(message.id);
      clearTimeout(pending.timeout);

      if (message.error) {
        pending.reject(new Error(`CDP Error: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    // Handle event notifications (messages without id)
    if (message.method && message.id === undefined) {
      // Handle specific CDP events with type safety
      if (message.method === 'Debugger.paused') {
        this.emitter.emit(
          'Debugger.paused',
          message.params as CDPDebuggerPausedParams | undefined,
        );
      } else if (message.method === 'Debugger.resumed') {
        this.emitter.emit('Debugger.resumed', undefined);
      } else if (message.method === 'Runtime.consoleAPICalled') {
        this.emitter.emit(
          'Runtime.consoleAPICalled',
          message.params as CDPConsoleAPICalledParams | undefined,
        );
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.emitter.emit(
          'Runtime.exceptionThrown',
          message.params as CDPExceptionThrownParams | undefined,
        );
      } else if (message.method === 'Debugger.scriptParsed') {
        // Emit script parsed events so adapters can build script mappings
        this.emitter.emit('Debugger.scriptParsed', message.params);
      } else if (message.method === 'Debugger.breakpointResolved') {
        // Emit breakpoint resolved events
        this.emitter.emit('Debugger.breakpointResolved', message.params);
      } else if (message.method === 'Runtime.executionContextCreated') {
        // Handle execution context events - these are common and expected
        // For now, silently ignore since we don't have a specific handler
      } else {
        // Only warn for truly unknown events
        console.warn(`Unknown CDP event: ${message.method}`);
      }
      return;
    }

    // Log unexpected messages
    this.emitter.emit('unexpectedMessage', message);
  }
}
