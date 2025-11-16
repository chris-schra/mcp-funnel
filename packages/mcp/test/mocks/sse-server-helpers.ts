/**
 * Helper utilities for mock SSE server
 * @internal
 */

import type { Response } from 'express';
import type { QueuedMessage, SSEConnection } from './mock-sse-server.js';

/**
 * Sends SSE formatted message to response stream
 * @param res - Express response object
 * @param data - Message data
 * @param event - Optional event type
 * @param id - Optional event ID
 * @param retry - Optional retry interval
 * @internal
 */
export function sendSSEMessage(
  res: Response,
  data: string,
  event?: string,
  id?: string,
  retry?: number,
): void {
  if (id) res.write(`id: ${id}\n`);
  if (event) res.write(`event: ${event}\n`);
  if (retry !== undefined) res.write(`retry: ${retry}\n`);
  res.write(`data: ${data}\n\n`);
}

/**
 * Sends queued message to single SSE connection
 * @param connection - SSE connection object
 * @param message - Message to send
 * @param onError - Error callback for cleanup
 * @internal
 */
export function sendMessageToSingleConnection(
  connection: SSEConnection,
  message: QueuedMessage,
  onError: (connectionId: string) => void,
): void {
  if (!connection.isActive) return;

  try {
    sendSSEMessage(connection.response, message.data, message.event, message.id, message.retry);
  } catch (_error) {
    connection.isActive = false;
    onError(connection.id);
  }
}

/**
 * Broadcasts message to all active connections
 * @param connections - Map of all connections
 * @param message - Message to broadcast
 * @param onError - Error callback for cleanup
 * @internal
 */
export function broadcastToConnections(
  connections: Map<string, SSEConnection>,
  message: QueuedMessage,
  onError: (connectionId: string) => void,
): void {
  for (const connection of connections.values()) {
    if (connection.isActive) {
      sendMessageToSingleConnection(connection, message, onError);
    }
  }
}

/**
 * Sets up CORS middleware headers
 * @param res - Express response object
 * @internal
 */
export function setCORSHeaders(res: Response): void {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Last-Event-ID, Cache-Control',
  );
}

/**
 * Validates authentication token from request
 * @param authHeader - Authorization header value
 * @param expectedToken - Expected token value
 * @param shouldSimulateAuthFailure - Whether to simulate auth failure
 * @returns True if auth is valid, false otherwise
 * @internal
 */
export function validateAuthToken(
  authHeader: string | undefined,
  expectedToken: string,
  shouldSimulateAuthFailure: boolean,
): boolean {
  const providedToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
  if (shouldSimulateAuthFailure || providedToken !== expectedToken) {
    return false;
  }
  return true;
}

/**
 * Finds messages to resend after reconnection
 * @param messageQueue - All queued messages
 * @param lastEventId - Last event ID received by client
 * @returns Array of messages to resend
 * @internal
 */
export function getMessagesToResend(
  messageQueue: QueuedMessage[],
  lastEventId: string | undefined,
): QueuedMessage[] {
  if (!lastEventId) return messageQueue;

  const lastIndex = messageQueue.findIndex((msg) => msg.id === lastEventId);
  return messageQueue.slice(Math.max(0, lastIndex + 1));
}
