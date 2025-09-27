import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  ProxyConfig,
  normalizeServers,
  TargetServer,
  TargetServerZod,
} from '../../config.js';
import { createTransport } from '../../transports/index.js';
import { StdioClientTransport } from '../../transports/implementations/stdio-client-transport.js';
import {
  ReconnectionManager,
  type ReconnectionConfig,
} from '../../transports/utils/transport-utils.js';
import { logEvent, logError } from '../../logger.js';
import { resolveServerEnvironment } from '../env.js';
import { ToolRegistry } from '../../tool-registry.js';
import { ServerStatus } from '../../types/index.js';
import {
  IConnectionManager,
  ServerConnection,
  DisconnectedServer,
  ConnectionStatus,
  ReconnectionEvent,
} from '../interfaces/connection-manager.interface.js';
import {
  IAuthProviderFactory,
  AuthProviderResult,
} from '../interfaces/auth-provider-factory.interface.js';

type ManualReconnectionTracker = Map<string, Promise<void>>;

export class ConnectionManager
  extends EventEmitter
  implements IConnectionManager
{
  private normalizedServers: (TargetServer | TargetServerZod)[];
  private connectedServers = new Map<string, ServerConnection>();
  private disconnectedServers = new Map<string, DisconnectedServer>();
  private reconnectionManagers = new Map<string, ReconnectionManager>();
  private manualReconnections: ManualReconnectionTracker = new Map();
  private manualDisconnectRequests = new Set<string>();

  constructor(
    private config: ProxyConfig,
    private configPath: string,
    private toolRegistry: ToolRegistry,
    private authProviderFactory: IAuthProviderFactory,
  ) {
    super();
    this.normalizedServers = normalizeServers(config.servers);

    // Initialize all servers as disconnected
    this.normalizedServers.forEach((server) => {
      this.disconnectedServers.set(server.name, { server });
    });
  }

  async initialize(): Promise<void> {
    const connectionPromises = this.normalizedServers.map(
      async (targetServer) => {
        try {
          await this.connectToServer(targetServer);
          return { name: targetServer.name, status: 'connected' as const };
        } catch (error) {
          console.error(
            `[connection-manager] Failed to connect to ${targetServer.name}:`,
            error,
          );
          logError('connection-failed', error, {
            name: targetServer.name,
            command: targetServer.command,
            args: targetServer.args,
          });
          return { name: targetServer.name, status: 'failed' as const, error };
        }
      },
    );

    const results = await Promise.allSettled(connectionPromises);
    const summary = results.map((r) =>
      r.status === 'fulfilled' ? r.value : r.reason,
    );
    logEvent('info', 'connection-manager:initialize_summary', { summary });
  }

  async connectToServer(
    targetServer: TargetServer | TargetServerZod,
  ): Promise<void> {
    logEvent('info', 'connection-manager:connect_start', {
      name: targetServer.name,
      command: targetServer.command,
      args: targetServer.args,
      hasAuth: !!(targetServer as TargetServerZod).auth,
      hasTransport: !!(targetServer as TargetServerZod).transport,
    });

    const client = new Client({
      name: `proxy-client-${targetServer.name}`,
      version: '1.0.0',
    });

    const transport = await this.createTransportForServer(targetServer);
    await client.connect(transport);

    // Set up disconnect handling
    this.setupDisconnectHandling(targetServer, client, transport);

    // Track connection
    const connectedAt = new Date().toISOString();
    const connection: ServerConnection = {
      server: targetServer,
      client,
      transport,
      connectedAt,
    };

    this.connectedServers.set(targetServer.name, connection);
    this.disconnectedServers.delete(targetServer.name);

    console.error(`[connection-manager] Connected to: ${targetServer.name}`);
    logEvent('info', 'connection-manager:connect_success', {
      name: targetServer.name,
    });

    // Emit server connected event
    this.emit('server.connected', {
      serverName: targetServer.name,
      status: 'connected',
      timestamp: connectedAt,
    } as ReconnectionEvent);

    // Discover tools from the newly connected server
    await this.discoverToolsFromServer(targetServer.name, client);
  }

  async disconnectServer(name: string): Promise<void> {
    const connection = this.connectedServers.get(name);
    if (!connection) {
      throw new Error(`Server '${name}' is not currently connected`);
    }

    this.manualDisconnectRequests.add(name);

    // Cancel any pending reconnection attempts
    const reconnectionManager = this.reconnectionManagers.get(name);
    if (reconnectionManager) {
      reconnectionManager.cancel();
      this.reconnectionManagers.delete(name);
    }

    try {
      await connection.transport.close();
      console.error(`[connection-manager] Manually disconnected from: ${name}`);
      logEvent('info', 'connection-manager:manual_disconnect', { name });

      // The disconnect handling will be triggered by transport close
    } catch (error) {
      console.error(
        `[connection-manager] Error during disconnection from ${name}:`,
        error,
      );
      logError('connection-manager:disconnect_failed', error, { name });
      throw error;
    } finally {
      this.manualDisconnectRequests.delete(name);
    }
  }

  async reconnectServer(name: string): Promise<void> {
    if (this.connectedServers.has(name)) {
      throw new Error(`Server '${name}' is already connected`);
    }

    if (this.manualReconnections.has(name)) {
      throw new Error(
        `Manual reconnection already in progress for server '${name}'`,
      );
    }

    const disconnectedInfo = this.disconnectedServers.get(name);
    if (!disconnectedInfo) {
      throw new Error(`Server '${name}' not found or not configured`);
    }

    const reconnectionPromise = (async () => {
      try {
        this.emit('server.reconnecting', {
          serverName: name,
          status: 'reconnecting',
          timestamp: new Date().toISOString(),
        } as ReconnectionEvent);

        // Reset reconnection manager if it exists
        const reconnectionManager = this.reconnectionManagers.get(name);
        if (reconnectionManager) {
          reconnectionManager.reset();
        }

        await this.connectToServer(disconnectedInfo.server);
        console.error(
          `[connection-manager] Successfully reconnected to: ${name}`,
        );
        logEvent('info', 'connection-manager:reconnected', { name });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.disconnectedServers.set(name, {
          server: disconnectedInfo.server,
          error: errorMessage,
        });

        console.error(
          `[connection-manager] Failed to reconnect to ${name}:`,
          error,
        );
        logError('connection-manager:reconnect_failed', error, { name });
        throw error;
      } finally {
        this.manualReconnections.delete(name);
      }
    })();

    this.manualReconnections.set(name, reconnectionPromise);
    return reconnectionPromise;
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      connected: new Map(this.connectedServers),
      disconnected: new Map(this.disconnectedServers),
    };
  }

  getServerStatus(name: string): ServerStatus {
    const connection = this.connectedServers.get(name);
    if (connection) {
      return {
        name,
        status: 'connected',
        connectedAt: connection.connectedAt,
      };
    }

    const disconnectedInfo = this.disconnectedServers.get(name);
    if (disconnectedInfo) {
      return {
        name,
        status: disconnectedInfo.error ? 'error' : 'disconnected',
        error: disconnectedInfo.error,
      };
    }

    return {
      name,
      status: 'disconnected',
    };
  }

  isServerConnected(name: string): boolean {
    return this.connectedServers.has(name);
  }

  getConnectedClients(): Map<string, Client> {
    const clients = new Map<string, Client>();
    for (const [name, connection] of this.connectedServers) {
      clients.set(name, connection.client);
    }
    return clients;
  }

  async destroy(): Promise<void> {
    // Cancel all reconnection managers
    for (const [, manager] of this.reconnectionManagers) {
      manager.cancel();
    }
    this.reconnectionManagers.clear();

    // Close all connections
    const disconnectPromises = Array.from(this.connectedServers.keys()).map(
      (name) => this.disconnectServer(name).catch(() => {}), // Ignore errors during cleanup
    );

    await Promise.allSettled(disconnectPromises);
    this.removeAllListeners();
  }

  private async createTransportForServer(
    targetServer: TargetServer | TargetServerZod,
  ): Promise<Transport> {
    const extendedServer = targetServer as TargetServerZod;
    const legacyServer = targetServer as TargetServer;

    const baseCommand =
      legacyServer.command ??
      (extendedServer.transport?.type === 'stdio'
        ? extendedServer.transport.command
        : undefined) ??
      '';
    const baseArgs =
      legacyServer.args ??
      (extendedServer.transport?.type === 'stdio'
        ? extendedServer.transport.args
        : undefined) ??
      [];

    const targetForEnv: TargetServer = {
      name: targetServer.name,
      command: baseCommand,
      args: Array.isArray(baseArgs) ? baseArgs : [],
      env: legacyServer.env,
      secretProviders: legacyServer.secretProviders,
    };

    const resolvedEnv = await resolveServerEnvironment(
      targetForEnv,
      this.config,
      this.configPath,
    );

    const authResult = this.authProviderFactory.createAuthProvider(
      extendedServer.auth,
      extendedServer.name,
      resolvedEnv,
    );

    const transportDependencies = authResult
      ? {
          authProvider: authResult.provider,
          tokenStorage: authResult.tokenStorage,
        }
      : undefined;

    if (extendedServer.transport) {
      const explicitTransportEnv =
        'env' in extendedServer.transport
          ? (extendedServer.transport.env ?? {})
          : {};

      const baseTransportEnv = {
        ...resolvedEnv,
        ...explicitTransportEnv,
      };

      const transportConfig =
        extendedServer.transport.type === 'stdio'
          ? {
              ...extendedServer.transport,
              command:
                extendedServer.transport.command ??
                legacyServer.command ??
                baseCommand,
              args:
                extendedServer.transport.args ?? legacyServer.args ?? baseArgs,
              env: baseTransportEnv,
            }
          : {
              ...extendedServer.transport,
              env: baseTransportEnv,
            };

      return createTransport(transportConfig, transportDependencies);
    } else {
      if (!legacyServer.command) {
        throw new Error(`Server ${targetServer.name} missing command field`);
      }

      return new StdioClientTransport(targetServer.name, {
        command: baseCommand,
        args: Array.isArray(baseArgs) ? baseArgs : [],
        env: resolvedEnv,
      });
    }
  }

  private setupDisconnectHandling(
    targetServer: TargetServer | TargetServerZod,
    client: Client,
    transport: Transport,
  ): void {
    const originalOnClose = transport.onclose;
    transport.onclose = () => {
      if (originalOnClose) {
        originalOnClose();
      }
      this.handleServerDisconnection(targetServer, 'transport_closed');
    };

    const originalOnError = transport.onerror;
    transport.onerror = (error: Error) => {
      if (originalOnError) {
        originalOnError(error);
      }

      logEvent('error', 'connection-manager:transport_error', {
        name: targetServer.name,
        error: error.message,
      });

      if (
        error.message.includes('connection') ||
        error.message.includes('closed')
      ) {
        this.handleServerDisconnection(
          targetServer,
          'transport_error',
          error.message,
        );
      }
    };
  }

  private handleServerDisconnection(
    targetServer: TargetServer | TargetServerZod,
    reason: string,
    errorMessage?: string,
  ): void {
    const serverName = targetServer.name;

    const manualDisconnectRequested =
      this.manualDisconnectRequests.has(serverName);
    const disconnectionReason =
      reason === 'manual_disconnect' || manualDisconnectRequested
        ? 'manual_disconnect'
        : reason;

    console.error(
      `[connection-manager] Server disconnected: ${serverName} (${disconnectionReason})`,
    );
    logEvent('info', 'connection-manager:disconnected', {
      name: serverName,
      reason: disconnectionReason,
      error: errorMessage,
    });

    // Move from connected to disconnected
    if (this.connectedServers.has(serverName)) {
      this.connectedServers.delete(serverName);

      const disconnectedServerInfo: DisconnectedServer = {
        server: targetServer,
        error: errorMessage,
      };

      this.disconnectedServers.set(serverName, disconnectedServerInfo);

      this.emit('server.disconnected', {
        serverName,
        status: 'disconnected',
        timestamp: new Date().toISOString(),
        reason: errorMessage || disconnectionReason,
      } as ReconnectionEvent);
    }

    // Remove tools from registry for this server
    this.toolRegistry.removeToolsFromServer(serverName);

    // Set up automatic reconnection if enabled and not manually disconnected
    const autoReconnectConfig = this.config.autoReconnect;
    const isAutoReconnectEnabled = autoReconnectConfig?.enabled !== false;
    const isManualDisconnect = disconnectionReason === 'manual_disconnect';

    if (isAutoReconnectEnabled && !isManualDisconnect) {
      this.setupAutoReconnection(targetServer);
    }

    if (manualDisconnectRequested) {
      this.manualDisconnectRequests.delete(serverName);
    }
  }

  private setupAutoReconnection(
    targetServer: TargetServer | TargetServerZod,
  ): void {
    const serverName = targetServer.name;

    if (!this.reconnectionManagers.has(serverName)) {
      const autoReconnectConfig = this.config.autoReconnect;
      const reconnectionConfig: ReconnectionConfig = {
        maxAttempts: autoReconnectConfig?.maxAttempts ?? 10,
        initialDelayMs: autoReconnectConfig?.initialDelayMs ?? 1000,
        backoffMultiplier: autoReconnectConfig?.backoffMultiplier ?? 2,
        maxDelayMs: autoReconnectConfig?.maxDelayMs ?? 60000,
      };

      const reconnectionManager = new ReconnectionManager(
        reconnectionConfig,
        () => this.attemptReconnection(targetServer),
        () => {
          console.error(
            `[connection-manager] Max reconnection attempts reached for ${serverName}`,
          );
          logEvent('error', 'connection-manager:max_reconnection_attempts', {
            name: serverName,
          });
          this.reconnectionManagers.delete(serverName);
        },
        'connection-manager:reconnection',
      );

      this.reconnectionManagers.set(serverName, reconnectionManager);
    }

    const reconnectionManager = this.reconnectionManagers.get(serverName);
    if (reconnectionManager) {
      reconnectionManager.scheduleReconnection();
    }
  }

  private async attemptReconnection(
    targetServer: TargetServer | TargetServerZod,
  ): Promise<void> {
    const serverName = targetServer.name;
    const reconnectionManager = this.reconnectionManagers.get(serverName);
    const retryAttempt = reconnectionManager?.getAttemptCount() || 0;

    this.emit('server.reconnecting', {
      serverName,
      status: 'reconnecting',
      timestamp: new Date().toISOString(),
      retryAttempt,
    } as ReconnectionEvent);

    try {
      await this.connectToServer(targetServer);

      if (reconnectionManager) {
        reconnectionManager.reset();
      }

      console.error(`[connection-manager] Auto-reconnected to: ${serverName}`);
      logEvent('info', 'connection-manager:auto_reconnected', {
        name: serverName,
      });
    } catch (error) {
      console.error(
        `[connection-manager] Auto-reconnection failed for ${serverName}:`,
        error,
      );
      logError('connection-manager:auto_reconnect_failed', error, {
        name: serverName,
      });

      if (reconnectionManager) {
        reconnectionManager.scheduleReconnection();
      }
    }
  }

  private async discoverToolsFromServer(
    serverName: string,
    client: Client,
  ): Promise<void> {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tool discovery timeout')), 5000);
      });

      const response = await Promise.race([client.listTools(), timeoutPromise]);

      for (const tool of response.tools) {
        this.toolRegistry.registerDiscoveredTool({
          fullName: `${serverName}__${tool.name}`,
          originalName: tool.name,
          serverName,
          definition: tool,
          client,
        });
      }
    } catch (error) {
      console.error(
        `[connection-manager] Failed to discover tools from ${serverName}:`,
        error,
      );
      logError('connection-manager:discovery_failed', error, {
        server: serverName,
      });
    }
  }
}
