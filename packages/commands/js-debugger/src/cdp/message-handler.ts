import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * JSON-RPC message types for the Chrome DevTools Protocol
 */
export interface JsonRpcRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcEvent {
  method: string;
  params: unknown;
}

/**
 * Pending promise tracking for request-response correlation
 */
export interface PendingPromise<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Handle incoming WebSocket messages
 */
export function handleWebSocketMessage(
  data: WebSocket.RawData,
  pendingPromises: Map<number, PendingPromise>,
  emitter: EventEmitter,
): void {
  try {
    const message = JSON.parse(data.toString()) as
      | JsonRpcResponse
      | JsonRpcEvent;

    if ('id' in message) {
      // Response to a method call
      handleResponse(message, pendingPromises);
    } else if ('method' in message) {
      // Event notification
      handleEvent(message, emitter);
    }
  } catch (error) {
    emitter.emit(
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
function handleResponse(
  response: JsonRpcResponse,
  pendingPromises: Map<number, PendingPromise>,
): void {
  const pending = pendingPromises.get(response.id);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeout);
  pendingPromises.delete(response.id);

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
function handleEvent(event: JsonRpcEvent, emitter: EventEmitter): void {
  emitter.emit(event.method, event.params);
}

/**
 * Reject all pending promises with the given error
 */
export function rejectAllPendingPromises(
  pendingPromises: Map<number, PendingPromise>,
  error: Error,
): void {
  for (const pending of pendingPromises.values()) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
  pendingPromises.clear();
}

/**
 * Send a CDP method call and return a promise
 */
export function sendCDPRequest<T = unknown>(
  ws: WebSocket,
  id: number,
  method: string,
  params: Record<string, unknown> | undefined,
  pendingPromises: Map<number, PendingPromise>,
  requestTimeout: number,
): Promise<T> {
  const request: JsonRpcRequest = { id, method };

  if (params && Object.keys(params).length > 0) {
    request.params = params;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingPromises.delete(id);
      reject(
        new Error(
          `Request timeout after ${requestTimeout}ms for method: ${method}`,
        ),
      );
    }, requestTimeout);

    pendingPromises.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timeout,
    });

    try {
      ws.send(JSON.stringify(request));
    } catch (error) {
      clearTimeout(timeout);
      pendingPromises.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
