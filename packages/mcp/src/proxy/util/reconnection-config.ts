import type { ReconnectableTransportOptions } from '../types.js';
import type { ReconnectionConfig } from '@mcp-funnel/models';

/**
 * Normalized reconnection options with all defaults filled in.
 * @public
 */
export interface NormalizedReconnectionOptions {
  /** Whether health checks are enabled */
  healthChecks: boolean;
  /** Health check interval in milliseconds */
  healthCheckInterval: number;
  /** Complete reconnection configuration with all fields required */
  reconnection: Required<ReconnectionConfig>;
}

/**
 * Creates normalized reconnection options with all defaults applied.
 * Fills in missing values with defaults:
 * - healthChecks: true
 * - healthCheckInterval: 30000ms
 * - initialDelayMs: 1000ms
 * - maxDelayMs: 30000ms
 * - maxAttempts: 10
 * - backoffMultiplier: 2
 * - jitter: 0.25
 * Also creates alias fields (initialDelay, maxDelay, maxRetries) for backward compatibility.
 * Extracted as pure function for testability.
 * @param options - Partial reconnection options from configuration
 * @returns Normalized options with all defaults applied
 * @public
 * @see file:../transports/reconnectable-transport.ts:71 - Usage in transport constructor
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
