import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logEvent } from '@mcp-funnel/core';
import type { TargetServerZod, TargetServer } from '@mcp-funnel/schemas';
import type { EventEmitter } from 'events';
import type { ToolRegistry } from '../../tool-registry/index.js';

/**
 * Configuration for setting up disconnect handling on a transport.
 * @public
 */
export interface DisconnectHandlingConfig {
  /** Server configuration */
  targetServer: TargetServer | TargetServerZod;
  /** Connected MCP client */
  client: Client;
  /** Active transport instance */
  transport: Transport;
  /** Callback invoked when transport disconnects or errors */
  onDisconnect: (
    targetServer: TargetServer | TargetServerZod,
    reason: string,
    errorMessage?: string,
  ) => void;
}

/**
 * Sets up disconnect handling for a connected server transport.
 * Wraps the transport's onclose and onerror handlers to trigger disconnect callbacks.
 * The onDisconnect callback is called with 'transport_closed' for clean closes and
 * 'transport_error' for connection errors.
 * @param config - Disconnect handling configuration
 * @public
 * @see file:./server-connection-manager.ts:168 - Usage in connection manager
 */
export function setupDisconnectHandling(config: DisconnectHandlingConfig): void {
  const { targetServer, transport, onDisconnect } = config;

  // Set up transport close handler
  const originalOnClose = transport.onclose;
  transport.onclose = () => {
    // Call original close handler if it exists
    if (originalOnClose) {
      originalOnClose();
    }

    // Handle the disconnection
    onDisconnect(targetServer, 'transport_closed');
  };

  // Set up transport error handler for connection issues
  const originalOnError = transport.onerror;
  transport.onerror = (error: Error) => {
    // Call original error handler if it exists
    if (originalOnError) {
      originalOnError(error);
    }

    // Log the error and handle disconnection if it's a connection error
    logEvent('error', 'server:transport_error', {
      name: targetServer.name,
      error: error.message,
    });

    // Handle disconnection for certain error types
    if (error.message.includes('connection') || error.message.includes('closed')) {
      onDisconnect(targetServer, 'transport_error', error.message);
    }
  };
}

/**
 * Configuration for handling server disconnection cleanup.
 * @public
 */
export interface ServerDisconnectionConfig {
  /** Server that disconnected */
  targetServer: TargetServer | TargetServerZod;
  /** Disconnect reason ('manual_disconnect', 'transport_closed', 'transport_error') */
  reason: string;
  /** Optional error message from transport */
  errorMessage?: string;
  /** Whether disconnect was manually requested by user */
  manualDisconnectRequested: boolean;
  /** Event emitter for server status events */
  eventEmitter: EventEmitter;
  /** Map of currently connected servers */
  connectedServers: Map<string, TargetServer | TargetServerZod>;
  /** Map of disconnected servers with error info */
  disconnectedServers: Map<string, (TargetServer | TargetServerZod) & { error?: string }>;
  /** Map of server name to client instance */
  clients: Map<string, Client>;
  /** Map of server name to connection timestamp */
  connectionTimestamps: Map<string, string>;
  /** Map of server name to transport */
  transports: Map<string, Transport>;
  /** Tool registry for removing server tools */
  toolRegistry: ToolRegistry;
}

/**
 * Handles server disconnection by cleaning up resources and updating state.
 * Cleanup performed:
 * - Moves server from connected to disconnected map with error info
 * - Removes client from clients map
 * - Removes all tools registered by this server from tool registry
 * - Deletes connection timestamp and transport references
 * - Emits 'server.disconnected' event
 * Manual disconnects are marked as 'manual_disconnect' regardless of the provided reason.
 * @param config - Disconnection configuration with all necessary state maps
 * @public
 * @see file:./server-connection-manager.ts:186 - Usage in disconnect callback
 */
export function handleServerDisconnection(config: ServerDisconnectionConfig): void {
  const {
    targetServer,
    reason,
    errorMessage,
    manualDisconnectRequested,
    eventEmitter,
    connectedServers,
    disconnectedServers,
    clients,
    connectionTimestamps,
    transports,
    toolRegistry,
  } = config;

  const serverName = targetServer.name;

  const disconnectionReason =
    reason === 'manual_disconnect' || manualDisconnectRequested ? 'manual_disconnect' : reason;

  console.error(`[proxy] Server disconnected: ${serverName} (${disconnectionReason})`);
  logEvent('info', 'server:disconnected', {
    name: serverName,
    reason: disconnectionReason,
    error: errorMessage,
  });

  // Move from connected to disconnected
  if (connectedServers.has(serverName)) {
    connectedServers.delete(serverName);

    // Add to disconnected servers with error info
    const disconnectedServerInfo = errorMessage
      ? { ...targetServer, error: errorMessage }
      : targetServer;

    disconnectedServers.set(serverName, disconnectedServerInfo);

    // Emit server disconnected event
    eventEmitter.emit('server.disconnected', {
      serverName,
      status: 'disconnected',
      timestamp: new Date().toISOString(),
      reason: errorMessage || disconnectionReason,
    });
  }

  // Clean up client reference and associated tracking data
  const client = clients.get(serverName);
  if (client) {
    clients.delete(serverName);

    // Clean up any resources associated with this client
    // Remove tools from registry for this server
    toolRegistry.removeToolsFromServer(serverName);
  }

  // Clean up connection tracking
  connectionTimestamps.delete(serverName);
  transports.delete(serverName);
}
