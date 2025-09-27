import Emittery from 'emittery';
import WebSocket from 'ws';
import type { ITypedCDPClient } from '../../types/index.js';
import type {
  CDPDebuggerPausedParams,
  CDPConsoleAPICalledParams,
  CDPExceptionThrownParams,
} from '../../cdp/types.js';

/**
 * CDP Message interface matching Chrome DevTools Protocol format
 */
interface CDPMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string; code?: number; data?: unknown };
}

/**
 * Typed CDP events map for Emittery
 * Using optional data for better compatibility
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
 * CDP Connection Handler
 *
 * Handles WebSocket connection to Chrome DevTools Protocol,
 * manages message ID tracking and request/response correlation,
 * and provides a typed send() method that returns promises.
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

  constructor() {
    // No super() call needed for composition
  }

  /**
   * Connect to CDP WebSocket endpoint
   */
  async connect(wsUrl: string): Promise<void> {
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
   * Disconnect from CDP WebSocket
   */
  async disconnect(): Promise<void> {
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
   * Send CDP command and wait for response
   */
  async send<T = unknown>(
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
   * Add typed event listener for CDP events
   */
  onTyped<K extends keyof CDPEvents>(
    event: K,
    handler: (params: CDPEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  /**
   * Add event listener for CDP events (ITypedCDPClient interface compatibility)
   */
  on(event: string, handler: (params?: unknown) => void): void {
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
   * Remove typed event listener for CDP events
   */
  offTyped<K extends keyof CDPEvents>(
    event: K,
    handler: (params: CDPEvents[K]) => void,
  ): void {
    this.emitter.off(event, handler);
  }

  /**
   * Remove event listener for CDP events (ITypedCDPClient interface compatibility)
   */
  off(event: string, handler: (params?: unknown) => void): void {
    // Note: For Emittery, we need to pass the exact same handler function
    // This is a limitation of the current approach
    this.emitter.off(
      event as keyof CDPEvents,
      handler as (params: CDPEvents[keyof CDPEvents]) => void,
    );
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Setup message handling for incoming CDP messages
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
   * Handle incoming CDP message
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
