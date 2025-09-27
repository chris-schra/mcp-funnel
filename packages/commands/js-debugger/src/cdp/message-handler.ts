import { EventEmitter } from 'events';
import WebSocket from 'ws';

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
 * Handles JSON-RPC message parsing, routing, and promise correlation
 *
 * Manages:
 * - Message ID generation and tracking
 * - Request-response correlation with timeouts
 * - Event routing and emission
 * - Error handling for malformed messages
 */
export class MessageHandler extends EventEmitter {
  private messageId = 0;
  private pendingPromises = new Map<number, PendingPromise>();

  constructor(private readonly requestTimeout: number) {
    super();
  }

  /**
   * Create and send a CDP method call
   */
  sendRequest<T = unknown>(
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
   * Handle incoming WebSocket messages
   */
  handleMessage(data: WebSocket.RawData): void {
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
   * Reject all pending promises with the given error
   */
  rejectAllPendingPromises(error: Error): void {
    for (const pending of this.pendingPromises.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingPromises.clear();
  }

  /**
   * Get the count of pending promises
   */
  get pendingRequestCount(): number {
    return this.pendingPromises.size;
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
   * Handle CDP events
   */
  private handleEvent(event: JsonRpcEvent): void {
    // Filter out noisy events for cleaner debugging
    if (event.method !== 'Debugger.scriptParsed') {
      console.debug('handleEvent', event.method, event.params);
    }
    this.emit(event.method, event.params);
  }
}
