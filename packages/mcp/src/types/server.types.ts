/**
 * Server configuration types that extend the existing TargetServer schema.
 * These types provide the TypeScript interface for the extended server configuration.
 */

import type { AuthConfig } from './auth.types.js';
import type { TransportConfig } from './transport.types.js';

/**
 * Base server configuration that matches the existing TargetServerSchema
 */
export interface BaseTargetServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Extended target server configuration that adds auth and transport options
 * while maintaining backward compatibility with existing configurations.
 *
 * The server must have either:
 * - A 'command' field (for stdio transport, backward compatibility)
 * - A 'transport' field (for new transport types like SSE)
 */
export interface TargetServer {
  name: string;

  // Legacy stdio configuration (for backward compatibility)
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // New transport configuration
  transport?: TransportConfig;

  // Authentication configuration
  auth?: AuthConfig;
}

/**
 * Extended target server configuration without the name field
 * (for use in record-based configuration where the key is the name)
 */
export type TargetServerWithoutName = Omit<TargetServer, 'name'>;

/**
 * Runtime status information for an MCP target server.
 * Provides a seam for other packages (e.g. the server API) without depending
 * on web-specific schemas.
 */
export interface ServerStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt?: string;
  error?: string;
}

/**
 * Payload emitted when a server reports a connected state.
 */
export interface ServerConnectedEventPayload {
  serverName: string;
  status: 'connected';
  timestamp: string;
}

/**
 * Payload emitted when a server transitions to a disconnected state.
 */
export interface ServerDisconnectedEventPayload {
  serverName: string;
  status: 'disconnected';
  timestamp: string;
  reason?: string;
  retryAttempt?: number;
}

/**
 * Payload emitted when an automatic reconnection attempt is scheduled.
 */
export interface ServerReconnectingEventPayload {
  serverName: string;
  status: 'reconnecting';
  timestamp: string;
  retryAttempt?: number;
  nextRetryDelayMs?: number;
  reason?: string;
}
