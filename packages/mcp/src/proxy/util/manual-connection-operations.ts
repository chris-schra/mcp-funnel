import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logError, logEvent, ReconnectionManager } from '@mcp-funnel/core';
import type { TargetServerZod, TargetServer } from '@mcp-funnel/schemas';
import { EventEmitter } from 'events';

/**
 * Context required for manual reconnection operations.
 * @internal
 */
export interface ManualReconnectionContext {
  serverName: string;
  disconnectedServer: (TargetServer | TargetServerZod) & { error?: string };
  reconnectionManager: ReconnectionManager | undefined;
  eventEmitter: EventEmitter;
  connectFn: (server: TargetServer | TargetServerZod) => Promise<void>;
  onSuccess: (name: string) => void;
  onFailure: (name: string, error: unknown) => void;
}

/**
 * Context required for manual disconnection operations.
 * @internal
 */
export interface ManualDisconnectionContext {
  serverName: string;
  targetServer: TargetServer | TargetServerZod;
  client: Client | undefined;
  transport: Transport | undefined;
  reconnectionManager: ReconnectionManager | undefined;
  onDisconnect: (
    targetServer: TargetServer | TargetServerZod,
    reason: string,
  ) => void;
  cleanupReconnectionManager: (name: string) => void;
}

/**
 * Performs manual reconnection to a disconnected server.
 *
 * Handles the complete reconnection flow including:
 * - Emitting reconnection events
 * - Resetting reconnection managers
 * - Attempting connection
 * - Error handling and state updates
 *
 * @param context - Context containing all required dependencies and callbacks
 * @throws \{Error\} When reconnection fails
 * @internal
 */
export async function performManualReconnect(
  context: ManualReconnectionContext,
): Promise<void> {
  const {
    serverName,
    disconnectedServer,
    reconnectionManager,
    eventEmitter,
    connectFn,
    onSuccess,
    onFailure,
  } = context;

  // Remove the error property if it exists for reconnection
  const serverConfig = { ...disconnectedServer };
  delete (serverConfig as { error?: string }).error;

  try {
    // Emit server reconnecting event
    eventEmitter.emit('server.reconnecting', {
      serverName,
      status: 'reconnecting',
      timestamp: new Date().toISOString(),
    });

    // Reset the ReconnectionManager if it exists
    if (reconnectionManager) {
      reconnectionManager.reset();
    }

    await connectFn(serverConfig);
    console.error(`[proxy] Successfully reconnected to: ${serverName}`);
    logEvent('info', 'server:reconnected', { name: serverName });

    onSuccess(serverName);
  } catch (error) {
    // Add error info back to disconnected server
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[proxy] Failed to reconnect to ${serverName}:`, error);
    logError('server:reconnect_failed', error, { name: serverName });

    onFailure(serverName, errorMessage);
    throw error;
  }
}

/**
 * Performs manual disconnection from a connected server.
 *
 * Handles the complete disconnection flow including:
 * - Canceling pending reconnection attempts
 * - Closing transport connections
 * - Triggering cleanup callbacks
 * - Error handling and logging
 *
 * @param context - Context containing all required dependencies and callbacks
 * @throws \{Error\} When disconnection fails
 * @internal
 */
export async function performManualDisconnect(
  context: ManualDisconnectionContext,
): Promise<void> {
  const {
    serverName,
    targetServer,
    client,
    transport,
    reconnectionManager,
    onDisconnect,
    cleanupReconnectionManager,
  } = context;

  // Cancel any pending reconnection attempts
  if (reconnectionManager) {
    reconnectionManager.cancel();
    cleanupReconnectionManager(serverName);
  }

  try {
    // Close the transport connection
    if (transport) {
      await transport.close();
    } else if (client) {
      // Fallback: access client's private transport if no transport reference
      const clientWithTransport = client as unknown as {
        _transport?: { close: () => Promise<void> };
      };
      if (clientWithTransport._transport?.close) {
        await clientWithTransport._transport.close();
      }
    }

    console.error(`[proxy] Manually disconnected from: ${serverName}`);
    logEvent('info', 'server:manual_disconnect', { name: serverName });

    // Clean up and move to disconnected state
    // Note: handleServerDisconnection will be called by the transport's onclose handler
    // But we also call it directly to ensure cleanup happens
    onDisconnect(targetServer, 'manual_disconnect');
  } catch (error) {
    console.error(
      `[proxy] Error during disconnection from ${serverName}:`,
      error,
    );
    logError('server:disconnect_failed', error, { name: serverName });
    throw error;
  }
}
