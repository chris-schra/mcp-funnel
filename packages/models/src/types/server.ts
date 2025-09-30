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
