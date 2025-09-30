/**
 * Message Parser Utilities for Transport Implementations
 *
 * Provides JSON-RPC message parsing with validation and error handling.
 * @internal
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { logEvent } from '../../../logger.js';

/**
 * Parses JSON string into JSON-RPC message with format validation.
 *
 * Validates that the parsed object contains the required jsonrpc: "2.0" field.
 * Logs parse errors and invokes optional error handler before throwing.
 * @param data - Raw JSON string to parse
 * @param logPrefix - Prefix for logging parse errors
 * @param onerror - Optional callback invoked when parsing fails
 * @returns Parsed and validated JSON-RPC message
 * @throws \{Error\} When JSON parsing fails or jsonrpc field is invalid
 * @internal
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
