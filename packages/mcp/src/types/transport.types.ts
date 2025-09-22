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
 * Reconnection configuration for transports that support reconnection
 */
export interface ReconnectionConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * WebSocket transport configuration
 */
export interface WebSocketTransportConfig {
  type: 'websocket';
  url: string;
  timeout?: number;
  reconnect?: ReconnectionConfig;
}

/**
 * StreamableHTTP transport configuration
 */
export interface StreamableHTTPTransportConfig {
  type: 'streamable-http';
  url: string;
  timeout?: number;
  reconnect?: ReconnectionConfig;
  sessionId?: string;
}

/**
 * Discriminated union of all transport configuration types
 */
export type TransportConfig =
  | StdioTransportConfig
  | SSETransportConfig
  | WebSocketTransportConfig
  | StreamableHTTPTransportConfig;
