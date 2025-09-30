/**
 * Helper utilities for test WebSocket server
 * @internal
 */

import type { ServerResponse } from 'http';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';

/**
 * Sends JSON response with given status code
 * @param res - HTTP response object
 * @param statusCode - HTTP status code to send
 * @param data - Response body data to serialize as JSON
 * @internal
 */
export function sendJsonResponse(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(data));
}

/**
 * Creates a welcome message for new WebSocket connections
 * @param clientId - Client identifier
 * @returns JSON-RPC welcome message
 * @internal
 */
export function createWelcomeMessage(clientId: string): JSONRPCMessage {
  return {
    jsonrpc: '2.0' as const,
    method: 'server/welcome',
    params: {
      clientId,
      serverTime: new Date().toISOString(),
      message: 'Connected to test WebSocket server',
    },
  };
}

/**
 * Creates an echo response for received JSON-RPC requests
 * @param message - Original request message
 * @returns JSON-RPC response echoing the request
 * @internal
 */
export function createEchoResponse(message: JSONRPCMessage): JSONRPCMessage {
  if (!('id' in message)) {
    throw new Error('Cannot create echo response for notification');
  }

  return {
    jsonrpc: '2.0' as const,
    id: message.id,
    result: {
      echo: message,
      processedAt: new Date().toISOString(),
    },
  };
}

/**
 * Creates a JSON-RPC parse error response
 * @returns JSON-RPC error response for parse failures
 * @internal
 */
export function createParseErrorResponse(): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32700,
      message: 'Parse error',
    },
  };
}

/**
 * Records a message in the history log
 * @param history - Message history array to append to
 * @param clientId - Client identifier
 * @param data - Message data
 * @param direction - Message direction
 * @internal
 */
export function recordMessage(
  history: Array<{
    id: string;
    clientId: string;
    data: JSONRPCMessage;
    timestamp: Date;
    direction: 'incoming' | 'outgoing';
  }>,
  clientId: string,
  data: JSONRPCMessage,
  direction: 'incoming' | 'outgoing',
): void {
  history.push({
    id: randomUUID(),
    clientId,
    data,
    timestamp: new Date(),
    direction,
  });
}
