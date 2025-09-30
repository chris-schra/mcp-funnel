/**
 * Cleanup Helper Utilities
 *
 * Shared helper functions for cleaning up transport resources.
 *
 * @internal
 */

import { logEvent } from '../../../logger.js';
import type { PendingRequest } from '../base-client-transport.js';

/**
 * Cleans up pending requests by aborting them and clearing the map.
 * @param pendingRequests - Map of pending requests
 * @internal
 */
export function cleanupPendingRequests(
  pendingRequests: Map<string, PendingRequest>,
): void {
  for (const [_id, pending] of pendingRequests) {
    pending.controller.abort();
    pending.reject(new Error('Transport closed'));
  }
  pendingRequests.clear();
}

/**
 * Logs transport closure event.
 * @param logPrefix - Log prefix for events
 * @param url - Transport URL
 * @internal
 */
export function logTransportClosure(logPrefix: string, url: string): void {
  logEvent('info', `${logPrefix}:closed`, { url });
}
