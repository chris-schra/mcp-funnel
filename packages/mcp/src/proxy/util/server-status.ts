import type { TargetServer, TargetServerZod } from '@mcp-funnel/schemas';
import type { ServerStatus } from '@mcp-funnel/models';

/**
 * Get the status of a single server by name
 * Returns ServerStatus object with current connection state
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
 * Check if a server is currently connected
 */
export function isServerConnected(
  name: string,
  connectedServers: Map<string, TargetServer | TargetServerZod>,
): boolean {
  return connectedServers.has(name);
}

/**
 * Get target servers categorized by connection state
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
