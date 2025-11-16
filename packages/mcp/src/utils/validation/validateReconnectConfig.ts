import { TransportError } from '@mcp-funnel/core';
import type { ReconnectionConfig } from '@mcp-funnel/models';

/**
 * Validates reconnection configuration shared by SSE, WebSocket, and StreamableHTTP transports.
 *
 * Validation rules:
 * - maxAttempts: Must be non-negative integer
 * - initialDelayMs: Must be non-negative number
 * - maxDelayMs: Must be non-negative number
 * - backoffMultiplier: Must be greater than 1
 * @param reconnect - Reconnection configuration to validate
 * @throws TransportError when any validation rule fails
 * @public
 */
export function validateReconnectConfig(reconnect: ReconnectionConfig): void {
  const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier } = reconnect;

  if (maxAttempts !== undefined && (maxAttempts < 0 || !Number.isInteger(maxAttempts))) {
    throw TransportError.protocolError('maxAttempts must be a positive number');
  }

  if (initialDelayMs !== undefined && initialDelayMs < 0) {
    throw TransportError.protocolError('initialDelayMs must be a positive number');
  }

  if (maxDelayMs !== undefined && maxDelayMs < 0) {
    throw TransportError.protocolError('maxDelayMs must be a positive number');
  }

  if (backoffMultiplier !== undefined && backoffMultiplier <= 1) {
    throw TransportError.protocolError('backoffMultiplier must be greater than 1');
  }
}
