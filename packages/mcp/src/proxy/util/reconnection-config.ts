import type { ReconnectableTransportOptions } from '../types.js';
import type { ReconnectionConfig } from '@mcp-funnel/models';

/**
 * Result of creating normalized reconnection options
 */
export interface NormalizedReconnectionOptions {
  healthChecks: boolean;
  healthCheckInterval: number;
  reconnection: Required<ReconnectionConfig>;
}

/**
 * Creates normalized reconnection options with all defaults filled in
 * Extracted pure function for better testability
 */
export function createNormalizedReconnectionOptions(
  options: ReconnectableTransportOptions,
): NormalizedReconnectionOptions {
  const initialDelayMs = options.reconnection?.initialDelayMs ?? 1000;
  const maxDelayMs = options.reconnection?.maxDelayMs ?? 30000;
  const maxAttempts = options.reconnection?.maxAttempts ?? 10;

  const reconnectionConfig: Required<ReconnectionConfig> = {
    initialDelayMs,
    initialDelay: initialDelayMs, // Alias
    maxDelayMs,
    maxDelay: maxDelayMs, // Alias
    backoffMultiplier: options.reconnection?.backoffMultiplier ?? 2,
    maxAttempts,
    maxRetries: maxAttempts, // Alias
    jitter: options.reconnection?.jitter ?? 0.25,
  };

  return {
    healthChecks: options.healthChecks ?? true,
    healthCheckInterval: options.healthCheckInterval ?? 30000,
    reconnection: reconnectionConfig,
  };
}
