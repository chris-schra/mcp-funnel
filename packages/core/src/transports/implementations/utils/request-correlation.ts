/**
 * Request Correlation Utilities
 *
 * Helper functions for handling JSON-RPC request correlation and timeout management.
 *
 * @internal
 */

import type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { RequestUtils } from '../../../utils/index.js';
import type { PendingRequest } from '../base-client-transport.js';

/**
 * Sets up request correlation tracking with timeout handling.
 *
 * Creates a promise that resolves when the response arrives or rejects on timeout.
 * Registers the pending request in the provided map.
 * @param request - JSON-RPC request to track
 * @param pendingRequests - Map to store pending request
 * @param timeout - Timeout in milliseconds
 * @param sendMessage - Function to send the message
 * @returns Promise that resolves when response received
 * @internal
 */
export async function setupRequestCorrelation(
  request: JSONRPCRequest,
  pendingRequests: Map<string, PendingRequest>,
  timeout: number,
  sendMessage: (message: JSONRPCMessage) => Promise<void>,
): Promise<void> {
  // Generate ID if not present
  if (!request.id) {
    request.id = RequestUtils.generateRequestId();
  }

  // Create promise for response correlation
  return new Promise<void>((resolve, reject) => {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      pendingRequests.delete(String(request.id));
      controller.abort();
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    const pending: PendingRequest = {
      resolve: (_response: JSONRPCResponse) => {
        clearTimeout(timeoutId);
        resolve();
      },
      reject: (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
      controller,
      timestamp: Date.now(),
    };

    pendingRequests.set(String(request.id), pending);

    // Send the message
    sendMessage(request).catch((error) => {
      pendingRequests.delete(String(request.id));
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}
