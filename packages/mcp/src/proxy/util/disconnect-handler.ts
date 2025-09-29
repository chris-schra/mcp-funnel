import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logEvent } from '@mcp-funnel/core';
import type { TargetServerZod, TargetServer } from '@mcp-funnel/schemas';
import type { EventEmitter } from 'events';
import type { ToolRegistry } from '../../tool-registry/index.js';

/**
 * Configuration for setting up disconnect handling
 */
export interface DisconnectHandlingConfig {
  targetServer: TargetServer | TargetServerZod;
  client: Client;
  transport: Transport;
  onDisconnect: (
    targetServer: TargetServer | TargetServerZod,
    reason: string,
    errorMessage?: string,
  ) => void;
}

/**
 * Set up disconnect handling for a connected server
 * Listens for transport close events and handles cleanup/reconnection
 */
export function setupDisconnectHandling(
  config: DisconnectHandlingConfig,
): void {
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
    if (
      error.message.includes('connection') ||
      error.message.includes('closed')
    ) {
      onDisconnect(targetServer, 'transport_error', error.message);
    }
  };
}

/**
 * Configuration for handling server disconnection
 */
export interface ServerDisconnectionConfig {
  targetServer: TargetServer | TargetServerZod;
  reason: string;
  errorMessage?: string;
  manualDisconnectRequested: boolean;
  eventEmitter: EventEmitter;
  connectedServers: Map<string, TargetServer | TargetServerZod>;
  disconnectedServers: Map<
    string,
    (TargetServer | TargetServerZod) & { error?: string }
  >;
  clients: Map<string, Client>;
  connectionTimestamps: Map<string, string>;
  transports: Map<string, Transport>;
  toolRegistry: ToolRegistry;
}

/**
 * Handle server disconnection by cleaning up resources and moving to disconnected state
 */
export function handleServerDisconnection(
  config: ServerDisconnectionConfig,
): void {
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
    reason === 'manual_disconnect' || manualDisconnectRequested
      ? 'manual_disconnect'
      : reason;

  console.error(
    `[proxy] Server disconnected: ${serverName} (${disconnectionReason})`,
  );
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
