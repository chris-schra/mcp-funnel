/**
 * Stdio Line Handler Utilities
 *
 * Provides line handling logic for stdout and stderr streams in stdio transport.
 * @internal
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { logEvent } from '../../../logger.js';

/**
 * Handles stdout line output by parsing JSON-RPC messages or logging non-JSON output.
 *
 * Attempts to parse each line as a JSON-RPC message. Valid messages are passed to
 * the onmessage callback. Non-JSON lines are logged to stderr with server prefix,
 * as they represent unexpected non-protocol output.
 * @param line - Raw line from stdout
 * @param serverName - Server name for logging and error prefixing
 * @param sessionId - Optional session ID for logging
 * @param onmessage - Callback invoked with successfully parsed JSON-RPC messages
 * @internal
 */
export function handleStdoutLine(
  line: string,
  serverName: string,
  sessionId: string | undefined,
  onmessage?: (message: JSONRPCMessage) => void,
): void {
  if (!line.trim()) {
    return;
  }

  try {
    const message = JSON.parse(line) as JSONRPCMessage;

    logEvent('debug', 'transport:stdio:message_received', {
      server: serverName,
      sessionId: sessionId,
      messageId: 'id' in message ? message.id : undefined,
      method: 'method' in message ? message.method : undefined,
    });

    if (onmessage) {
      onmessage(message);
    }
  } catch {
    // Not a JSON message, treat as stderr-like output
    logEvent('debug', 'transport:stdio:nonjson_stdout', {
      server: serverName,
      sessionId: sessionId,
      line: line.slice(0, 200), // Truncate for logging
    });

    // Log to stderr stream since it's non-protocol output
    console.error(`[${serverName}] ${line}`);
  }
}

/**
 * Handles stderr line output by logging with server prefix.
 *
 * All stderr output is logged to console.error with the server name prefix
 * for debugging and error visibility. Also creates debug log events.
 * @param line - Raw line from stderr
 * @param serverName - Server name for error prefixing and logging
 * @param sessionId - Optional session ID for logging
 * @internal
 */
export function handleStderrLine(
  line: string,
  serverName: string,
  sessionId: string | undefined,
): void {
  if (!line.trim()) {
    return;
  }

  // Log stderr with server prefix
  console.error(`[${serverName}] ${line}`);

  logEvent('debug', 'transport:stdio:stderr', {
    server: serverName,
    sessionId: sessionId,
    line: line.slice(0, 200), // Truncate for logging
  });
}
