import { TransportError } from '@mcp-funnel/core';
import type { ReconnectionConfig } from '@mcp-funnel/models';

/**
 * Validates reconnection configuration (shared by SSE, WebSocket, and StreamableHTTP).
 */
export function validateReconnectConfig(reconnect: ReconnectionConfig): void {
  const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier } =
    reconnect;

  if (
    maxAttempts !== undefined &&
    (maxAttempts < 0 || !Number.isInteger(maxAttempts))
  ) {
    throw TransportError.protocolError('maxAttempts must be a positive number');
  }

  if (initialDelayMs !== undefined && initialDelayMs < 0) {
    throw TransportError.protocolError(
      'initialDelayMs must be a positive number',
    );
  }

  if (maxDelayMs !== undefined && maxDelayMs < 0) {
    throw TransportError.protocolError('maxDelayMs must be a positive number');
  }

  if (backoffMultiplier !== undefined && backoffMultiplier <= 1) {
    throw TransportError.protocolError(
      'backoffMultiplier must be greater than 1',
    );
  }
}
