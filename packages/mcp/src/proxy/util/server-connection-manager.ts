import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logError, logEvent, ReconnectionManager } from '@mcp-funnel/core';
import type {
  TargetServerZod,
  ProxyConfig,
  TargetServer,
} from '@mcp-funnel/schemas';
import { ToolRegistry } from '../../tool-registry/index.js';
import { EventEmitter } from 'events';
import { connectToServer, type ConnectionConfig } from './connection-setup.js';
import {
  createReconnectionManager,
  attemptReconnection,
  shouldAutoReconnect,
} from './reconnection-handler.js';
import {
  setupDisconnectHandling,
  handleServerDisconnection,
} from './disconnect-handler.js';

/**
 * Manages server connection lifecycle including connections, disconnections, and reconnections.
 *
 * Provides centralized management of MCP server connections with automatic reconnection
 * support, state tracking, and event emission. Extracted from MCPProxy to reduce complexity.
 *
 * Key responsibilities:
 * - Connecting to target servers with transport setup
 * - Tracking connected and disconnected server states
 * - Handling automatic and manual reconnections with backoff
 * - Managing graceful disconnections and cleanup
 * - Emitting connection lifecycle events
 * @public
 * @see file:./connection-setup.ts - Server connection logic
 * @see file:./reconnection-handler.ts - Reconnection management
 */
export class ServerConnectionManager {
  private connectedServers = new Map<string, TargetServer | TargetServerZod>();
  private disconnectedServers = new Map<
    string,
    (TargetServer | TargetServerZod) & { error?: string }
  >();
  private connectionTimestamps = new Map<string, string>();
  private transports = new Map<string, Transport>();
  private reconnectionManagers = new Map<string, ReconnectionManager>();
  private manualReconnections = new Map<string, Promise<void>>();
  private manualDisconnectRequests = new Set<string>();

  public constructor(
    private config: ProxyConfig,
    private configPath: string,
    private clients: Map<string, Client>,
    private toolRegistry: ToolRegistry,
    private eventEmitter: EventEmitter,
  ) {}

  /**
   * Initializes the disconnected servers list at startup.
   * @param servers - Array of target server configurations to mark as disconnected
   * @public
   */
  public initializeDisconnectedServers(
    servers: (TargetServer | TargetServerZod)[],
  ): void {
    servers.forEach((server) => {
      this.disconnectedServers.set(server.name, server);
    });
  }

  /**
   * Handles server disconnection events from transports.
   *
   * Called by transport close/error handlers to update state, clean up resources,
   * and potentially trigger automatic reconnection if enabled.
   * @param targetServer - Server that disconnected
   * @param reason - Disconnection reason ('manual_disconnect', 'error', etc.)
   * @param errorMessage - Optional error message if disconnection was due to error
   * @internal
   */
  private onServerDisconnect = (
    targetServer: TargetServer | TargetServerZod,
    reason: string,
    errorMessage?: string,
  ): void => {
    const serverName = targetServer.name;
    const manualDisconnectRequested =
      this.manualDisconnectRequests.has(serverName);

    // Handle the disconnection using extracted logic
    handleServerDisconnection({
      targetServer,
      reason,
      errorMessage,
      manualDisconnectRequested,
      eventEmitter: this.eventEmitter,
      connectedServers: this.connectedServers,
      disconnectedServers: this.disconnectedServers,
      clients: this.clients,
      connectionTimestamps: this.connectionTimestamps,
      transports: this.transports,
      toolRegistry: this.toolRegistry,
    });

    // Set up automatic reconnection if enabled
    const isManualDisconnect =
      reason === 'manual_disconnect' || manualDisconnectRequested;

    if (shouldAutoReconnect(this.config, isManualDisconnect)) {
      this.setupAutoReconnection(targetServer);
    }

    if (manualDisconnectRequested) {
      this.manualDisconnectRequests.delete(serverName);
    }
  };

  /**
   * Sets up automatic reconnection for a disconnected server.
   *
   * Creates or reuses a ReconnectionManager and schedules the first reconnection attempt.
   * @param targetServer - Server configuration to reconnect
   * @internal
   */
  private setupAutoReconnection(
    targetServer: TargetServer | TargetServerZod,
  ): void {
    const serverName = targetServer.name;

    // Create ReconnectionManager if it doesn't exist
    if (!this.reconnectionManagers.has(serverName)) {
      const manager = createReconnectionManager({
        config: this.config,
        serverName,
        onMaxAttemptsReached: (name) => {
          this.reconnectionManagers.delete(name);
        },
      });

      this.reconnectionManagers.set(serverName, manager);
    }

    // Schedule the first reconnection attempt
    const reconnectionManager = this.reconnectionManagers.get(serverName);
    if (reconnectionManager) {
      reconnectionManager.scheduleReconnection(() =>
        this.attemptAutoReconnection(targetServer),
      );
    }
  }

  /**
   * Attempts automatic reconnection to a disconnected server.
   *
   * Used by ReconnectionManager for scheduled reconnection attempts with backoff.
   * Handles success by resetting the manager and failure by rescheduling.
   * @param targetServer - Server configuration to reconnect
   * @internal
   */
  private async attemptAutoReconnection(
    targetServer: TargetServer | TargetServerZod,
  ): Promise<void> {
    const serverName = targetServer.name;
    const reconnectionManager = this.reconnectionManagers.get(serverName);

    await attemptReconnection({
      targetServer,
      reconnectionManager,
      eventEmitter: this.eventEmitter,
      connectFn: (server) => this.connectToSingleServer(server),
      onSuccess: (name) => {
        const manager = this.reconnectionManagers.get(name);
        if (manager) {
          manager.reset();
        }
      },
      onFailure: (name) => {
        // Re-schedule reconnection - the ReconnectionManager will handle backoff
        const manager = this.reconnectionManagers.get(name);
        if (manager) {
          manager.scheduleReconnection(() =>
            this.attemptAutoReconnection(targetServer),
          );
        }
      },
    });
  }

  /**
   * Connects to a single target server and sets up disconnect handling.
   *
   * Creates transport, establishes MCP client connection, registers tools,
   * and tracks connection state. Emits server.connected event on success.
   * @param targetServer - Server configuration to connect to
   * @throws {Error} When connection fails (transport, authentication, or protocol errors)
   * @public
   * @see file:./connection-setup.ts:11 - connectToServer implementation
   */
  public async connectToSingleServer(
    targetServer: TargetServer | TargetServerZod,
  ): Promise<void> {
    const connectionConfig: ConnectionConfig = {
      targetServer,
      config: this.config,
      configPath: this.configPath,
      toolRegistry: this.toolRegistry,
    };

    const { client, transport, connectedAt } =
      await connectToServer(connectionConfig);

    // Set up disconnect handling
    setupDisconnectHandling({
      targetServer,
      client,
      transport,
      onDisconnect: this.onServerDisconnect,
    });

    // Track connection state
    this.connectionTimestamps.set(targetServer.name, connectedAt);
    this.transports.set(targetServer.name, transport);
    this.connectedServers.set(targetServer.name, targetServer);
    this.disconnectedServers.delete(targetServer.name);
    this.clients.set(targetServer.name, client);

    // Emit server connected event
    this.eventEmitter.emit('server.connected', {
      serverName: targetServer.name,
      status: 'connected',
      timestamp: connectedAt,
    });
  }

  /**
   * Connects to all configured target servers in parallel.
   *
   * Continues proxy startup even if individual servers fail to connect.
   * Failed servers remain in disconnected state for later reconnection.
   * @param servers - Array of target server configurations
   * @public
   */
  public async connectToTargetServers(
    servers: (TargetServer | TargetServerZod)[],
  ): Promise<void> {
    const connectionPromises = servers.map(async (targetServer) => {
      try {
        await this.connectToSingleServer(targetServer);
        return { name: targetServer.name, status: 'connected' as const };
      } catch (error) {
        console.error(
          `[proxy] Failed to connect to ${targetServer.name}:`,
          error,
        );
        logError('connection-failed', error, {
          name: targetServer.name,
          command: targetServer.command,
          args: targetServer.args,
        });
        // Do not throw; continue starting proxy with remaining servers
        return { name: targetServer.name, status: 'failed' as const, error };
      }
    });

    const results = await Promise.allSettled(connectionPromises);
    const summary = results.map((r) =>
      r.status === 'fulfilled' ? r.value : r.reason,
    );
    logEvent('info', 'server:connect_summary', { summary });
  }

  /**
   * Manually reconnects to a disconnected server.
   *
   * Finds the server in disconnectedServers, resets its ReconnectionManager,
   * and attempts connection. Emits server.reconnecting event.
   * @param name - Server name to reconnect
   * @throws {Error} When server is already connected, reconnection in progress, or server not found
   * @public
   */
  public async reconnectServer(name: string): Promise<void> {
    // Check if server is already connected
    if (this.connectedServers.has(name)) {
      throw new Error(`Server '${name}' is already connected`);
    }

    if (this.manualReconnections.has(name)) {
      throw new Error(
        `Manual reconnection already in progress for server '${name}'`,
      );
    }

    // Find the server in disconnectedServers
    const disconnectedServer = this.disconnectedServers.get(name);
    if (!disconnectedServer) {
      throw new Error(`Server '${name}' not found or not configured`);
    }

    // Remove the error property if it exists for reconnection
    const serverConfig = { ...disconnectedServer };
    delete (serverConfig as { error?: string }).error;

    const reconnectionPromise = (async () => {
      try {
        // Emit server reconnecting event
        this.eventEmitter.emit('server.reconnecting', {
          serverName: name,
          status: 'reconnecting',
          timestamp: new Date().toISOString(),
        });

        // Reset the ReconnectionManager if it exists
        const reconnectionManager = this.reconnectionManagers.get(name);
        if (reconnectionManager) {
          reconnectionManager.reset();
        }

        await this.connectToSingleServer(serverConfig);
        console.error(`[proxy] Successfully reconnected to: ${name}`);
        logEvent('info', 'server:reconnected', { name });
      } catch (error) {
        // Add error info back to disconnected server
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.disconnectedServers.set(name, {
          ...disconnectedServer,
          error: errorMessage,
        });

        console.error(`[proxy] Failed to reconnect to ${name}:`, error);
        logError('server:reconnect_failed', error, { name });
        throw error;
      } finally {
        this.manualReconnections.delete(name);
      }
    })();

    this.manualReconnections.set(name, reconnectionPromise);
    return reconnectionPromise;
  }

  /**
   * Manually disconnects from a connected server.
   *
   * Closes transport connection, cancels pending reconnection attempts,
   * and moves server to disconnected state. Does not trigger auto-reconnection.
   * @param name - Server name to disconnect
   * @throws {Error} When server is not currently connected
   * @public
   */
  public async disconnectServer(name: string): Promise<void> {
    // Check if server is currently connected
    if (!this.connectedServers.has(name)) {
      throw new Error(`Server '${name}' is not currently connected`);
    }

    const targetServer = this.connectedServers.get(name)!;
    const client = this.clients.get(name);
    const transport = this.transports.get(name);

    this.manualDisconnectRequests.add(name);

    // Cancel any pending reconnection attempts
    const reconnectionManager = this.reconnectionManagers.get(name);
    if (reconnectionManager) {
      reconnectionManager.cancel();
      this.reconnectionManagers.delete(name);
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

      console.error(`[proxy] Manually disconnected from: ${name}`);
      logEvent('info', 'server:manual_disconnect', { name });

      // Clean up and move to disconnected state
      // Note: handleServerDisconnection will be called by the transport's onclose handler
      // But we also call it directly to ensure cleanup happens
      this.onServerDisconnect(targetServer, 'manual_disconnect');
    } catch (error) {
      console.error(`[proxy] Error during disconnection from ${name}:`, error);
      logError('server:disconnect_failed', error, { name });
      throw error;
    } finally {
      this.manualDisconnectRequests.delete(name);
    }
  }

  // Getters for external access
  public getConnectedServers() {
    return this.connectedServers;
  }

  public getDisconnectedServers() {
    return this.disconnectedServers;
  }

  public getConnectionTimestamps() {
    return this.connectionTimestamps;
  }

  public getTransports() {
    return this.transports;
  }

  public getReconnectionManagers() {
    return this.reconnectionManagers;
  }
}
