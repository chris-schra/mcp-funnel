import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logError, logEvent, ReconnectionManager } from '@mcp-funnel/core';
import type { TargetServerZod, ProxyConfig, TargetServer } from '@mcp-funnel/schemas';
import { ToolRegistry } from '../../tool-registry/index.js';
import { EventEmitter } from 'events';
import { connectToServer, type ConnectionConfig } from './connection-setup.js';
import { clearTransportCache } from '../../utils/transport/index.js';
import {
  createReconnectionManager,
  attemptReconnection,
  shouldAutoReconnect,
} from './reconnection-handler.js';
import { setupDisconnectHandling, handleServerDisconnection } from './disconnect-handler.js';
import { performManualReconnect, performManualDisconnect } from './manual-connection-operations.js';

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
  private slowProbeTimers = new Map<string, ReturnType<typeof setInterval>>();
  private isShuttingDown = false;

  /** Default interval for slow probe mode in milliseconds (60 seconds). @internal */
  private static readonly SLOW_PROBE_INTERVAL_MS = 60000;

  public constructor(
    private config: ProxyConfig,
    private configPath: string,
    private clients: Map<string, Client>,
    private toolRegistry: ToolRegistry,
    private eventEmitter: EventEmitter,
  ) {}

  /**
   * Initializes disconnected servers map from configuration. @public
   * @param servers - Array of target server configurations to track as disconnected
   */
  public initializeDisconnectedServers(servers: (TargetServer | TargetServerZod)[]): void {
    servers.forEach((server) => {
      this.disconnectedServers.set(server.name, server);
    });
  }

  /**
   * @param targetServer - Server that disconnected
   * @param reason - Reason for disconnection
   * @param errorMessage - Optional error message describing the disconnection
   * @internal
   */
  private onServerDisconnect = (
    targetServer: TargetServer | TargetServerZod,
    reason: string,
    errorMessage?: string,
  ): void => {
    const serverName = targetServer.name;
    const manualDisconnectRequested = this.manualDisconnectRequests.has(serverName);

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
    const isManualDisconnect = reason === 'manual_disconnect' || manualDisconnectRequested;

    if (shouldAutoReconnect(this.config, isManualDisconnect, this.isShuttingDown)) {
      this.setupAutoReconnection(targetServer);
    }

    if (manualDisconnectRequested) {
      this.manualDisconnectRequests.delete(serverName);
    }
  };

  /**
   * Sets up automatic reconnection for a disconnected server. @internal
   * @param targetServer - Server configuration to set up automatic reconnection for
   */
  private setupAutoReconnection(targetServer: TargetServer | TargetServerZod): void {
    const serverName = targetServer.name;

    // Create ReconnectionManager if it doesn't exist
    if (!this.reconnectionManagers.has(serverName)) {
      const manager = createReconnectionManager({
        config: this.config,
        serverName,
        onMaxAttemptsReached: (name) => {
          this.reconnectionManagers.delete(name);
          // Instead of giving up, enter slow probe mode
          this.startSlowProbeMode(targetServer);
        },
      });

      this.reconnectionManagers.set(serverName, manager);
    }

    // Schedule the first reconnection attempt
    const reconnectionManager = this.reconnectionManagers.get(serverName);
    if (reconnectionManager) {
      reconnectionManager.scheduleReconnection(() => this.attemptAutoReconnection(targetServer));
    }
  }

  /**
   * Starts slow probe mode for a server after max reconnection attempts.
   * Periodically attempts to reconnect at a slower interval (every 60 seconds)
   * instead of giving up entirely. This follows the circuit breaker pattern
   * best practice of continuing to probe for recovery.
   * @param targetServer - Server configuration to probe
   * @internal
   */
  private startSlowProbeMode(targetServer: TargetServer | TargetServerZod): void {
    const serverName = targetServer.name;

    // Don't start if already in slow probe mode or shutting down
    if (this.slowProbeTimers.has(serverName) || this.isShuttingDown) {
      return;
    }

    console.error(
      `[proxy] Server ${serverName}: Max reconnection attempts reached. Entering slow probe mode (every ${ServerConnectionManager.SLOW_PROBE_INTERVAL_MS / 1000}s)`,
    );
    logEvent('info', 'server:slow_probe_started', { name: serverName });

    // Emit event for slow probe mode
    this.eventEmitter.emit('server.slow_probe_started', {
      serverName,
      status: 'slow_probe',
      timestamp: new Date().toISOString(),
      probeIntervalMs: ServerConnectionManager.SLOW_PROBE_INTERVAL_MS,
    });

    const probeTimer = setInterval(async () => {
      // Stop probing if shutting down or manually disconnected
      if (this.isShuttingDown || this.manualDisconnectRequests.has(serverName)) {
        this.stopSlowProbeMode(serverName);
        return;
      }

      try {
        // Clear transport cache to ensure we create a fresh transport (not the closed one)
        clearTransportCache();

        await this.connectToSingleServer(targetServer);

        // Success! Stop slow probe mode
        this.stopSlowProbeMode(serverName);
        console.error(`[proxy] Server ${serverName}: Recovered via slow probe mode`);
        logEvent('info', 'server:slow_probe_recovered', { name: serverName });
      } catch {
        // Still failing, continue probing silently
      }
    }, ServerConnectionManager.SLOW_PROBE_INTERVAL_MS);

    this.slowProbeTimers.set(serverName, probeTimer);
  }

  /**
   * Stops slow probe mode for a server.
   * @param serverName - Name of the server to stop probing
   * @internal
   */
  private stopSlowProbeMode(serverName: string): void {
    const timer = this.slowProbeTimers.get(serverName);
    if (timer) {
      clearInterval(timer);
      this.slowProbeTimers.delete(serverName);
    }
  }

  /**
   * Attempts automatic reconnection to a server with backoff. @internal
   * @param targetServer - Server configuration to attempt reconnection for
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
          manager.scheduleReconnection(() => this.attemptAutoReconnection(targetServer));
        }
      },
    });
  }

  /**
   * Connects to a single target server and sets up disconnect handling.
   * @param targetServer - Server configuration to connect to
   * @public
   */
  public async connectToSingleServer(targetServer: TargetServer | TargetServerZod): Promise<void> {
    const connectionConfig: ConnectionConfig = {
      targetServer,
      config: this.config,
      configPath: this.configPath,
      toolRegistry: this.toolRegistry,
    };

    const { client, transport, connectedAt } = await connectToServer(connectionConfig);

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

    // Stop slow probe mode if it was running (server recovered)
    this.stopSlowProbeMode(targetServer.name);

    // Emit server connected event
    this.eventEmitter.emit('server.connected', {
      serverName: targetServer.name,
      status: 'connected',
      timestamp: connectedAt,
    });
  }

  /**
   * Connects to all configured target servers in parallel.
   * @param servers - Array of target server configurations
   * @public
   */
  public async connectToTargetServers(servers: (TargetServer | TargetServerZod)[]): Promise<void> {
    const connectionPromises = servers.map(async (targetServer) => {
      try {
        await this.connectToSingleServer(targetServer);
        return { name: targetServer.name, status: 'connected' as const };
      } catch (error) {
        console.error(`[proxy] Failed to connect to ${targetServer.name}:`, error);
        logError('connection-failed', error, {
          name: targetServer.name,
          command: targetServer.command,
          args: targetServer.args,
        });
        return { name: targetServer.name, status: 'failed' as const, error };
      }
    });

    const results = await Promise.allSettled(connectionPromises);
    const summary = results.map((r) => (r.status === 'fulfilled' ? r.value : r.reason));
    logEvent('info', 'server:connect_summary', { summary });
  }

  /**
   * Manually reconnects to a disconnected server.
   * @param name - Server name to reconnect
   * @returns Promise that resolves when reconnection completes
   * @public
   */
  public async reconnectServer(name: string): Promise<void> {
    // Check if server is already connected
    if (this.connectedServers.has(name)) {
      throw new Error(`Server '${name}' is already connected`);
    }

    if (this.manualReconnections.has(name)) {
      throw new Error(`Manual reconnection already in progress for server '${name}'`);
    }

    // Find the server in disconnectedServers
    const disconnectedServer = this.disconnectedServers.get(name);
    if (!disconnectedServer) {
      throw new Error(`Server '${name}' not found or not configured`);
    }

    const reconnectionPromise = (async () => {
      try {
        await performManualReconnect({
          serverName: name,
          disconnectedServer,
          reconnectionManager: this.reconnectionManagers.get(name),
          eventEmitter: this.eventEmitter,
          connectFn: (server) => this.connectToSingleServer(server),
          onSuccess: () => {
            // Success is already logged in performManualReconnect
          },
          onFailure: (serverName, errorMessage) => {
            this.disconnectedServers.set(serverName, {
              ...disconnectedServer,
              error: String(errorMessage),
            });
          },
        });
      } finally {
        this.manualReconnections.delete(name);
      }
    })();

    this.manualReconnections.set(name, reconnectionPromise);
    return reconnectionPromise;
  }

  /**
   * Manually disconnects from a connected server.
   * @param name - Server name to disconnect
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

    try {
      await performManualDisconnect({
        serverName: name,
        targetServer,
        client,
        transport,
        reconnectionManager: this.reconnectionManagers.get(name),
        onDisconnect: (server, reason) => this.onServerDisconnect(server, reason),
        cleanupReconnectionManager: (serverName) => this.reconnectionManagers.delete(serverName),
      });
    } finally {
      this.manualDisconnectRequests.delete(name);
    }
  }

  /** @returns Map of currently connected servers @public */
  public getConnectedServers() {
    return this.connectedServers;
  }

  /** @returns Map of disconnected servers with optional error messages @public */
  public getDisconnectedServers() {
    return this.disconnectedServers;
  }

  /** @returns Map of server connection timestamps @public */
  public getConnectionTimestamps() {
    return this.connectionTimestamps;
  }

  /** @returns Map of active server transports @public */
  public getTransports() {
    return this.transports;
  }

  /** @returns Map of server reconnection managers @public */
  public getReconnectionManagers() {
    return this.reconnectionManagers;
  }

  /**
   * Initiates graceful shutdown of all connections.
   * Prevents new reconnections and cleans up all active connections.
   * @public
   */
  public async shutdown(): Promise<void> {
    console.error('SessionManager shutting down...');
    this.isShuttingDown = true;

    // Cancel all active reconnection timers
    for (const [name, manager] of this.reconnectionManagers.entries()) {
      manager.cancel();
      this.reconnectionManagers.delete(name);
    }

    // Cancel all slow probe timers
    for (const [name] of this.slowProbeTimers.entries()) {
      this.stopSlowProbeMode(name);
    }

    // Close all active client connections
    const disconnectPromises = Array.from(this.connectedServers.keys()).map(async (name) => {
      try {
        const client = this.clients.get(name);
        if (client) {
          await client.close();
        }
      } catch (_error) {
        // Ignore errors during shutdown
      }
    });

    await Promise.allSettled(disconnectPromises);
    console.error('SessionManager shutdown complete');
  }
}
