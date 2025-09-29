/**
 * Message Parser Utilities for Transport Implementations
 *
 * Provides JSON-RPC message parsing with validation and error handling.
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { logEvent } from '../../../logger.js';

/**
 * Parse message with error handling
 */
export function parseMessage(
  data: string,
  logPrefix: string,
  onerror?: (error: Error) => void,
): JSONRPCMessage {
  try {
    const message = JSON.parse(data) as JSONRPCMessage;

    // Validate JSON-RPC format
    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      throw new Error(
        'Invalid JSON-RPC format: missing or incorrect jsonrpc version',
      );
    }

    return message;
  } catch (error) {
    const parseError = new Error(`Failed to parse message: ${error}`);

    logEvent('error', `${logPrefix}:parse-error`, {
      error: parseError.message,
      data,
    });

    if (onerror) {
      onerror(parseError);
    }

    throw parseError;
  }
}
