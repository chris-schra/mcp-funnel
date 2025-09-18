/**
 * Transport configuration types for MCP OAuth implementation.
 * These types define the discriminated unions for different transport methods.
 */

/**
 * Standard input/output transport configuration
 */
export interface StdioTransportConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Server-sent events transport configuration
 */
export interface SSETransportConfig {
  type: 'sse';
  url: string;
  timeout?: number;
  reconnect?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  };
}

/**
 * Discriminated union of all transport configuration types
 */
export type TransportConfig = StdioTransportConfig | SSETransportConfig;
