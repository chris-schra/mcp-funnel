import type { TargetServer, TargetServerZod } from '@mcp-funnel/schemas';
import type { ServerStatus } from '@mcp-funnel/models';

/**
 * Gets the current status of a single server by name.
 *
 * Checks connected and disconnected server maps to determine current state.
 * Returns 'connected', 'disconnected', or 'error' status with relevant metadata.
 * @param name - Server name to query
 * @param connectedServers - Map of currently connected servers
 * @param disconnectedServers - Map of disconnected servers with optional error info
 * @param connectionTimestamps - Map of connection timestamps for connected servers
 * @returns ServerStatus object with current state and metadata
 * @public
 */
export function getServerStatus(
  name: string,
  connectedServers: Map<string, TargetServer | TargetServerZod>,
  disconnectedServers: Map<
    string,
    (TargetServer | TargetServerZod) & { error?: string }
  >,
  connectionTimestamps: Map<string, string>,
): ServerStatus {
  // Check if server is connected
  if (connectedServers.has(name)) {
    const connectedAt = connectionTimestamps.get(name);
    return {
      name,
      status: 'connected',
      connectedAt,
    };
  }

  // Check if server is in disconnected state
  const disconnectedServer = disconnectedServers.get(name);
  if (disconnectedServer) {
    return {
      name,
      status: disconnectedServer.error ? 'error' : 'disconnected',
      error: disconnectedServer.error,
    };
  }

  // Server not found in either map - return disconnected status
  return {
    name,
    status: 'disconnected',
  };
}

/**
 * Checks if a server is currently connected.
 * @param name - Server name to check
 * @param connectedServers - Map of currently connected servers
 * @returns True if server is connected, false otherwise
 * @public
 */
export function isServerConnected(
  name: string,
  connectedServers: Map<string, TargetServer | TargetServerZod>,
): boolean {
  return connectedServers.has(name);
}

/**
 * Gets all target servers categorized by connection state.
 * @param connectedServers - Map of currently connected servers
 * @param disconnectedServers - Map of disconnected servers with optional error info
 * @returns Object with connected and disconnected server arrays
 * @public
 */
export function getTargetServers(
  connectedServers: Map<string, TargetServer | TargetServerZod>,
  disconnectedServers: Map<
    string,
    (TargetServer | TargetServerZod) & { error?: string }
  >,
) {
  return {
    connected: Array.from(connectedServers),
    disconnected: Array.from(disconnectedServers),
  };
}
