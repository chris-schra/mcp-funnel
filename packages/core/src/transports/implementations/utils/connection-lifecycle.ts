/**
 * Connection Lifecycle Utilities
 *
 * Shared helper functions for handling connection lifecycle events
 * in client transport implementations.
 *
 * @internal
 */

import type { JSONRPCMessage, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
import { TransportError } from '../../errors/transport-error.js';
import type { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { RequestUtils } from '../../../utils/index.js';
import { logEvent } from '../../../logger.js';
import type { PendingRequest } from '../base-client-transport.js';

/**
 * Context object for connection lifecycle operations.
 * @internal
 */
export interface ConnectionLifecycleContext {
  /** Log prefix for events */
  logPrefix: string;
  /** Transport URL */
  url: string;
  /** Pending requests map */
  pendingRequests: Map<string, PendingRequest>;
  /** Reconnection manager */
  reconnectionManager: ReconnectionManager;
  /** Whether transport is closed */
  isClosed: boolean;
  /** onmessage callback */
  onmessage?: (message: JSONRPCMessage) => void;
  /** onerror callback */
  onerror?: (error: Error) => void;
  /** onclose callback */
  onclose?: () => void;
  /** Session ID setter */
  setSessionId: (id: string) => void;
  /** Connect function for reconnection */
  connect: () => Promise<void>;
}

/**
 * Handles successful connection establishment.
 *
 * Resets reconnection counter and generates session ID.
 * @param context - Connection lifecycle context
 * @internal
 */
export function handleConnectionOpen(context: ConnectionLifecycleContext): void {
  // Reset reconnection counter on successful connection
  context.reconnectionManager.reset();

  logEvent('info', `${context.logPrefix}:connected`, {
    url: context.url,
  });

  // Generate session ID
  context.setSessionId(RequestUtils.generateSessionId());
}

/**
 * Handles received JSON-RPC messages with automatic response correlation.
 *
 * For messages with an ID, attempts to match with pending requests and
 * resolve/reject the corresponding promise. Always forwards to onmessage callback.
 * @param message - Received JSON-RPC message
 * @param context - Connection lifecycle context
 * @internal
 */
export function handleMessage(message: JSONRPCMessage, context: ConnectionLifecycleContext): void {
  logEvent('debug', `${context.logPrefix}:message-received`, {
    id: 'id' in message ? message.id : 'none',
    method: 'method' in message ? message.method : 'none',
  });

  // Handle response correlation
  if ('id' in message && message.id !== null && message.id !== undefined) {
    const pending = context.pendingRequests.get(String(message.id));
    if (pending) {
      context.pendingRequests.delete(String(message.id));

      if ('error' in message && message.error) {
        // JSON-RPC error response
        const errorMessage = message.error.message || 'Unknown JSON-RPC error';
        const errorCode = message.error.code || -1;
        pending.reject(new Error(`JSON-RPC error ${errorCode}: ${errorMessage}`));
      } else {
        // Successful response
        pending.resolve(message as JSONRPCResponse);
      }
    }
  }

  // Always forward to onmessage callback
  if (context.onmessage) {
    context.onmessage(message);
  }
}

/**
 * Handles connection errors with automatic retry for retryable errors.
 *
 * Converts errors to TransportError if needed, logs the error, triggers
 * onerror callback, and schedules reconnection if the error is retryable.
 * @param error - Error that occurred
 * @param context - Connection lifecycle context
 * @internal
 */
export function handleConnectionError(error: Error, context: ConnectionLifecycleContext): void {
  const transportError =
    error instanceof TransportError
      ? error
      : TransportError.connectionFailed(`Connection error: ${error.message}`, error);

  logEvent('error', `${context.logPrefix}:connection-error`, {
    error: transportError.message,
    code: transportError.code,
  });

  if (context.onerror) {
    context.onerror(transportError);
  }

  // Attempt reconnection if retryable
  if (transportError.isRetryable && !context.isClosed) {
    context.reconnectionManager.scheduleReconnection(context.connect);
  }
}

/**
 * Handles connection close with optional reconnection scheduling.
 *
 * Logs the closure, triggers onerror callback if error provided, and schedules
 * reconnection if appropriate and not manually closed.
 * @param reason - Optional close reason string
 * @param shouldReconnect - Whether to attempt reconnection
 * @param error - Optional error that caused the closure
 * @param context - Connection lifecycle context
 * @internal
 */
export function handleConnectionClose(
  reason: string | undefined,
  shouldReconnect: boolean,
  error: TransportError | undefined,
  context: ConnectionLifecycleContext,
): void {
  logEvent('info', `${context.logPrefix}:connection-closed`, {
    reason: reason || 'none',
    url: context.url,
    reconnectionAttempts: context.reconnectionManager.getAttemptCount(),
  });

  if (error && context.onerror) {
    context.onerror(error);
  }

  // Schedule reconnection if appropriate and not manually closed
  if (shouldReconnect && !context.isClosed) {
    context.reconnectionManager.scheduleReconnection(context.connect);
  } else if (context.onclose && context.isClosed) {
    context.onclose();
  }
}
