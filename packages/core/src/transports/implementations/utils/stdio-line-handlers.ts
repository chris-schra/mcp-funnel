/**
 * Stdio Line Handler Utilities
 *
 * Provides line handling logic for stdout and stderr streams in stdio transport.
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { logEvent } from '../../../logger.js';

/**
 * Handle a line of output from the process stdout.
 * Expected to contain JSON-RPC messages.
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
 * Handle a line of output from the process stderr.
 * Used for debugging and error information.
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
