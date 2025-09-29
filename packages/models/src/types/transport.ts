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

export interface ReconnectionConfig {
  /** Maximum reconnection attempts */
  maxAttempts?: number;
  maxRetries?: number; // Alias for maxAttempts
  /** Initial delay in milliseconds */
  initialDelayMs?: number;
  initialDelay?: number; // Alias for initialDelayMs
  /** Maximum delay cap in milliseconds */
  maxDelayMs?: number;
  maxDelay?: number; // Alias for maxDelayMs
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Jitter percentage as a decimal (default: 0.25 for ±25%) */
  jitter?: number;
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

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Failed = 'failed',
}

export interface ConnectionStateChange {
  from: ConnectionState;
  to: ConnectionState;
  retryCount: number;
  nextRetryDelay?: number;
  error?: Error;
}
