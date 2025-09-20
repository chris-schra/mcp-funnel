import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Notification,
} from '@modelcontextprotocol/sdk/types.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { EventEmitter } from 'events';
import {
  ProxyConfig,
  normalizeExtendedServers,
  TargetServer,
  ExtendedTargetServerZod,
  AuthConfigZod,
  TransportConfigZod,
} from './config.js';
import { createTransport } from './transports/index.js';
import { StdioClientTransport } from './transports/implementations/stdio-client-transport.js';
import {
  ReconnectionManager,
  type ReconnectionConfig,
} from './transports/utils/transport-utils.js';
import {
  MemoryTokenStorage,
  OAuth2ClientCredentialsProvider,
  OAuth2AuthCodeProvider,
  BearerTokenAuthProvider,
  NoAuthProvider,
  AuthenticationError,
  type IAuthProvider,
  type ITokenStorage,
} from './auth/index.js';
import { TokenStorageFactory } from './auth/token-storage-factory.js';
import { ICoreTool, CoreToolContext } from './tools/core-tool.interface.js';
import { DiscoverToolsByWords } from './tools/discover-tools-by-words/index.js';
import { GetToolSchema } from './tools/get-tool-schema/index.js';
import { BridgeToolRequest } from './tools/bridge-tool-request/index.js';
import { LoadToolset } from './tools/load-toolset/index.js';
import type { ServerStatus } from './types/index.js';
import { discoverCommands, type ICommand } from '@mcp-funnel/commands-core';
import { writeFileSync, mkdirSync, Dirent } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logEvent, logError } from './logger.js';
import { ToolRegistry } from './tool-registry.js';

import Package from '../package.json';
export {
  getUserDir,
  getUserBasePath,
  getDefaultProjectConfigPath,
  resolveMergedProxyConfig,
} from './config-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, '../.logs');

type ManualReconnectionTracker = Map<string, Promise<void>>;

/**
 * Simple wrapper class for the transport factory function to provide dependency injection.
 */
class TransportFactory {
  constructor(private tokenStorage: ITokenStorage) {}

  async createTransport(
    serverName: string,
    transportConfig: TransportConfigZod,
    authProvider: IAuthProvider,
  ) {
    return createTransport(transportConfig, {
      authProvider,
      tokenStorage: this.tokenStorage,
    });
  }
}

// Ensure log directory exists
try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch (_error) {
  // Log dir might already exist
}

function legacyErrorLog(
  error: unknown,
  context: string = 'general',
  serverName?: string,
) {
  const timestamp = new Date().toISOString();
  const prefix = serverName ? `${serverName}-` : '';
  const logFile = resolve(
    LOG_DIR,
    `error-${timestamp.replace(/:/g, '-')}-${prefix}${context}.log`,
  );

  const err = error as {
    message?: string;
    stack?: string;
    code?: string;
    syscall?: string;
    path?: string;
  };
  const errorDetails = {
    timestamp,
    context,
    serverName,
    message: err?.message || String(error),
    stack: err?.stack,
    code: err?.code,
    syscall: err?.syscall,
    path: err?.path,
    processInfo: {
      pid: process.pid,
      argv: process.argv,
      cwd: process.cwd(),
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH,
      },
    },
  };

  try {
    writeFileSync(logFile, JSON.stringify(errorDetails, null, 2));
    console.error(`[proxy] Error logged to: ${logFile}`);
  } catch (writeError) {
    console.error('[proxy] Failed to write error log:', writeError);
  }
}

export type ProxyStartOptions = {
  transport: 'stdio' | 'streamable-http';
};

export class MCPProxy extends EventEmitter {
  private _server: Server;
  private _clients: Map<string, Client> = new Map();
  private _config: ProxyConfig;
  private _normalizedServers: (TargetServer | ExtendedTargetServerZod)[];
  private toolRegistry: ToolRegistry;
  private coreTools: Map<string, ICoreTool> = new Map();
  private transportFactory: TransportFactory;

  private connectedServers = new Map<
    string,
    TargetServer | ExtendedTargetServerZod
  >();
  private disconnectedServers = new Map<
    string,
    (TargetServer | ExtendedTargetServerZod) & { error?: string }
  >();
  private connectionTimestamps = new Map<string, string>();
  private transports = new Map<string, Transport>();
  private reconnectionManagers = new Map<string, ReconnectionManager>();
  private manualReconnections: ManualReconnectionTracker = new Map();

  constructor(config: ProxyConfig) {
    super();
    this._config = config;
    this._normalizedServers = normalizeExtendedServers(config.servers);
    this.toolRegistry = new ToolRegistry(config);

    // Initialize TransportFactory with MemoryTokenStorage
    const tokenStorage = new MemoryTokenStorage();
    this.transportFactory = new TransportFactory(tokenStorage);

    this._normalizedServers.forEach((server) => {
      this.disconnectedServers.set(server.name, server);
    });

    this._server = new Server(
      {
        name: 'mcp-funnel',
        version: Package.version,
      },
      {
        capabilities: {
          tools: {
            listChanged: true, // Support dynamic tool updates
          },
        },
      },
    );
  }

  async initialize() {
    this.registerCoreTools();

    await Promise.all([
      this.connectToTargetServers(),
      this.loadDevelopmentCommands(),
    ]);

    // Pre-populate registry with discovered tools
    try {
      await this.discoverAllTools();
    } catch (error) {
      console.error('[proxy] Initial tool discovery failed:', error);
      logError('initial-tool-discovery', error);
    }
    this.setupRequestHandlers();
  }

  private registerCoreTools() {
    const tools: ICoreTool[] = [
      new DiscoverToolsByWords(),
      new GetToolSchema(),
      new BridgeToolRequest(),
      new LoadToolset(),
    ];

    for (const tool of tools) {
      if (tool.isEnabled(this._config)) {
        this.coreTools.set(tool.name, tool);
        // Register core tools with the registry (they bypass exposeTools filtering)
        this.toolRegistry.registerDiscoveredTool({
          fullName: tool.name,
          originalName: tool.name,
          serverName: 'mcp-funnel',
          definition: tool.tool,
          isCoreTool: true,
        });
        if (tool.onInit) {
          tool.onInit(this.createToolContext());
        }
        console.error(`[proxy] Registered core tool: ${tool.name}`);
      }
    }
  }

  private async loadDevelopmentCommands(): Promise<void> {
    // Only load if explicitly enabled in config
    if (!this._config.commands?.enabled) return;

    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const commandsPath = join(__dirname, '../../commands');

      const enabledCommands = this._config.commands.list || [];

      const registerFromRegistry = async (
        registry: Awaited<ReturnType<typeof discoverCommands>>,
      ) => {
        for (const commandName of registry.getAllCommandNames()) {
          const command = registry.getCommandForMCP(commandName);
          if (
            command &&
            (enabledCommands.length === 0 ||
              enabledCommands.includes(command.name))
          ) {
            const mcpDefs = command.getMCPDefinitions();
            const isSingle = mcpDefs.length === 1;
            const singleMatchesCommand =
              isSingle && mcpDefs[0]?.name === command.name;

            for (const mcpDef of mcpDefs) {
              const useCompact =
                singleMatchesCommand && mcpDef.name === command.name;
              const displayName = useCompact
                ? `${command.name}`
                : `${command.name}_${mcpDef.name}`;

              if (!mcpDef.description) {
                throw new Error(
                  `Tool ${mcpDef.name} from command ${command.name} is missing a description`,
                );
              }
              // Register command tool in the registry
              this.toolRegistry.registerDiscoveredTool({
                fullName: displayName,
                originalName: mcpDef.name,
                serverName: 'commands',
                definition: { ...mcpDef, name: displayName },
                command,
              });
            }
          }
        }
      };

      // 1) Bundled commands (only when the directory exists in this build)
      try {
        const { existsSync } = await import('fs');
        if (existsSync(commandsPath)) {
          const bundledRegistry = await discoverCommands(commandsPath);
          await registerFromRegistry(bundledRegistry);
        }
      } catch {
        // ignore
      }

      // 2) Zero-config auto-scan for installed command packages under node_modules/@mcp-funnel
      try {
        const scopeDir = join(process.cwd(), 'node_modules', '@mcp-funnel');
        const { readdirSync, existsSync } = await import('fs');
        if (existsSync(scopeDir)) {
          const entries = readdirSync(scopeDir, { withFileTypes: true });
          const packageDirs = entries
            .filter(
              (e: Dirent) => e.isDirectory() && e.name.startsWith('command-'),
            )
            .map((e: Dirent) => join(scopeDir, e.name));

          const isValidCommand = (obj: unknown): obj is ICommand => {
            if (!obj || typeof obj !== 'object') return false;
            const c = obj as Record<string, unknown>;
            return (
              typeof c.name === 'string' &&
              typeof c.description === 'string' &&
              typeof c.executeToolViaMCP === 'function' &&
              typeof c.executeViaCLI === 'function' &&
              typeof c.getMCPDefinitions === 'function'
            );
          };

          for (const pkgDir of packageDirs) {
            try {
              const pkgJsonPath = join(pkgDir, 'package.json');
              if (!existsSync(pkgJsonPath)) continue;
              const { readFile } = await import('fs/promises');
              const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf-8')) as {
                module?: string;
                main?: string;
              };
              const entry = pkg.module || pkg.main;
              if (!entry) continue;
              const mod = await import(join(pkgDir, entry));
              const modObj = mod as Record<string, unknown>;
              const candidate = modObj.default || modObj.command;
              const chosen = isValidCommand(candidate)
                ? candidate
                : (Object.values(modObj).find(isValidCommand) as
                    | ICommand
                    | undefined);
              if (
                chosen &&
                (enabledCommands.length === 0 ||
                  enabledCommands.includes(chosen.name))
              ) {
                // Reuse registration logic
                const mcpDefs = chosen.getMCPDefinitions();
                const isSingle = mcpDefs.length === 1;
                const singleMatchesCommand =
                  isSingle && mcpDefs[0]?.name === chosen.name;
                for (const mcpDef of mcpDefs) {
                  const useCompact =
                    singleMatchesCommand && mcpDef.name === chosen.name;
                  const displayName = useCompact
                    ? `${chosen.name}`
                    : `${chosen.name}_${mcpDef.name}`;
                  if (!mcpDef.description) {
                    throw new Error(
                      `Tool ${mcpDef.name} from command ${chosen.name} is missing a description`,
                    );
                  }
                  // Register command tool in the registry
                  this.toolRegistry.registerDiscoveredTool({
                    fullName: displayName,
                    originalName: mcpDef.name,
                    serverName: 'commands',
                    definition: { ...mcpDef, name: displayName },
                    command: chosen,
                  });
                }
              }
            } catch (_err) {
              // skip invalid package
              continue;
            }
          }
        }
      } catch (_e) {
        // No scope directory or unreadable; ignore
      }
    } catch (error) {
      console.error('Failed to load commands:', error);
    }
  }

  private createToolContext(): CoreToolContext {
    return {
      toolRegistry: this.toolRegistry,
      // Backward compatibility - provide the caches from registry
      toolDescriptionCache: this.toolRegistry.getToolDescriptions(),
      toolDefinitionCache: this.toolRegistry.getToolDefinitions(),
      dynamicallyEnabledTools: new Set(
        this.toolRegistry
          .getAllTools()
          .filter((t) => t.enabled && t.enabledBy)
          .map((t) => t.fullName),
      ),
      config: this._config,
      enableTools: (toolNames: string[]) => {
        this.toolRegistry.enableTools(toolNames, 'discovery');
        for (const toolName of toolNames) {
          console.error(`[proxy] Dynamically enabled tool: ${toolName}`);
        }
        // Send notification that the tool list has changed
        this._server.sendToolListChanged();
        console.error(`[proxy] Sent tools/list_changed notification`);
      },
      sendNotification: async (
        method: string,
        params?: Record<string, unknown>,
      ) => {
        try {
          // Create a properly typed notification object that conforms to the Notification interface
          const notification: Notification = {
            method,
            ...(params !== undefined && { params }),
          };
          // Type assertion is required because the Server class restricts notifications to specific types,
          // but this function needs to support arbitrary custom notifications
          // Await the notification to properly catch async errors
          await this._server.notification(notification as Notification);
        } catch (error) {
          // Server might not be connected in tests - log but don't throw
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[proxy] Failed to send ${method} notification: ${errorMessage}`,
          );
        }
      },
    };
  }

  /**
   * Creates an appropriate auth provider based on the authentication configuration
   */
  private createAuthProvider(
    authConfig?: AuthConfigZod,
    serverName?: string,
  ): IAuthProvider {
    if (!authConfig || authConfig.type === 'none') {
      return new NoAuthProvider();
    }

    switch (authConfig.type) {
      case 'bearer': {
        return new BearerTokenAuthProvider({ token: authConfig.token });
      }
      case 'oauth2-client': {
        const tokenStorage = TokenStorageFactory.create('auto', serverName);
        return new OAuth2ClientCredentialsProvider(
          {
            type: 'oauth2-client',
            clientId: authConfig.clientId,
            clientSecret: authConfig.clientSecret,
            tokenEndpoint: authConfig.tokenEndpoint,
            scope: authConfig.scope,
            audience: authConfig.audience,
          },
          tokenStorage,
        );
      }
      case 'oauth2-code': {
        const tokenStorage = TokenStorageFactory.create('auto', serverName);
        return new OAuth2AuthCodeProvider(
          {
            type: 'oauth2-code',
            clientId: authConfig.clientId,
            clientSecret: authConfig.clientSecret,
            authorizationEndpoint: authConfig.authorizationEndpoint,
            tokenEndpoint: authConfig.tokenEndpoint,
            redirectUri: authConfig.redirectUri,
            scope: authConfig.scope,
            audience: authConfig.audience,
          },
          tokenStorage,
        );
      }
      default: {
        // TypeScript exhaustiveness check - this should never be reached
        const _exhaustive: never = authConfig;
        throw new Error(
          `Unsupported auth type: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  }

  /**
   * Set up disconnect handling for a connected server
   * Listens for transport close events and handles cleanup/reconnection
   */
  private setupDisconnectHandling(
    targetServer: TargetServer | ExtendedTargetServerZod,
    client: Client,
    transport: Transport,
  ): void {
    // Set up transport close handler
    const originalOnClose = transport.onclose;
    transport.onclose = () => {
      // Call original close handler if it exists
      if (originalOnClose) {
        originalOnClose();
      }

      // Handle the disconnection
      this.handleServerDisconnection(targetServer, 'transport_closed');
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
        this.handleServerDisconnection(
          targetServer,
          'transport_error',
          error.message,
        );
      }
    };
  }

  /**
   * Handle server disconnection by cleaning up resources and moving to disconnected state
   */
  private handleServerDisconnection(
    targetServer: TargetServer | ExtendedTargetServerZod,
    reason: string,
    errorMessage?: string,
  ): void {
    const serverName = targetServer.name;

    console.error(`[proxy] Server disconnected: ${serverName} (${reason})`);
    logEvent('info', 'server:disconnected', {
      name: serverName,
      reason,
      error: errorMessage,
    });

    // Move from connected to disconnected
    if (this.connectedServers.has(serverName)) {
      this.connectedServers.delete(serverName);

      // Add to disconnected servers with error info
      const disconnectedServerInfo = errorMessage
        ? { ...targetServer, error: errorMessage }
        : targetServer;

      this.disconnectedServers.set(serverName, disconnectedServerInfo);

      // Emit server disconnected event
      this.emit('server.disconnected', {
        serverName,
        status: 'disconnected',
        timestamp: new Date().toISOString(),
        reason: errorMessage || reason,
      });
    }

    // Clean up client reference and associated tracking data
    const client = this._clients.get(serverName);
    if (client) {
      this._clients.delete(serverName);

      // Clean up any resources associated with this client
      // Remove tools from registry for this server
      this.toolRegistry.removeToolsFromServer(serverName);
    }

    // Clean up connection tracking
    this.connectionTimestamps.delete(serverName);
    this.transports.delete(serverName);

    // Set up automatic reconnection if enabled and not manually disconnected
    const autoReconnectConfig = this._config.autoReconnect;
    const isAutoReconnectEnabled = autoReconnectConfig?.enabled !== false;
    const isManualDisconnect = reason === 'manual_disconnect';

    if (isAutoReconnectEnabled && !isManualDisconnect) {
      // Create ReconnectionManager if it doesn't exist
      if (!this.reconnectionManagers.has(serverName)) {
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
              `[proxy] Max reconnection attempts reached for ${serverName}`,
            );
            logEvent('error', 'server:max_reconnection_attempts', {
              name: serverName,
            });
            // Clean up the reconnection manager
            this.reconnectionManagers.delete(serverName);
          },
          'proxy:reconnection',
        );

        this.reconnectionManagers.set(serverName, reconnectionManager);
      }

      // Schedule the first reconnection attempt
      const reconnectionManager = this.reconnectionManagers.get(serverName);
      if (reconnectionManager) {
        reconnectionManager.scheduleReconnection();
      }
    }
  }

  /**
   * Attempt to reconnect to a disconnected server
   * Used by ReconnectionManager for automatic reconnection
   */
  private async attemptReconnection(
    targetServer: TargetServer | ExtendedTargetServerZod,
  ): Promise<void> {
    const serverName = targetServer.name;

    // Get retry attempt number from reconnection manager
    const reconnectionManager = this.reconnectionManagers.get(serverName);
    const retryAttempt = reconnectionManager?.getAttemptCount() || 0;

    // Emit server reconnecting event for automatic reconnection
    this.emit('server.reconnecting', {
      serverName,
      status: 'reconnecting',
      timestamp: new Date().toISOString(),
      retryAttempt,
    });

    try {
      await this.connectToSingleServer(targetServer);

      // Reset the reconnection manager on successful connection
      const reconnectionManager = this.reconnectionManagers.get(serverName);
      if (reconnectionManager) {
        reconnectionManager.reset();
      }

      console.error(`[proxy] Auto-reconnected to: ${serverName}`);
      logEvent('info', 'server:auto_reconnected', { name: serverName });
    } catch (error) {
      console.error(
        `[proxy] Auto-reconnection failed for ${serverName}:`,
        error,
      );
      logError('server:auto_reconnect_failed', error, { name: serverName });

      // Re-schedule reconnection - the ReconnectionManager will handle backoff
      const reconnectionManager = this.reconnectionManagers.get(serverName);
      if (reconnectionManager) {
        reconnectionManager.scheduleReconnection();
      }
    }
  }

  /**
   * Connect to a single target server
   * Extracted from connectToTargetServers for reuse in reconnection logic
   */
  private async connectToSingleServer(
    targetServer: TargetServer | ExtendedTargetServerZod,
  ): Promise<void> {
    logEvent('info', 'server:connect_start', {
      name: targetServer.name,
      command: targetServer.command,
      args: targetServer.args,
      hasAuth: !!(targetServer as ExtendedTargetServerZod).auth,
      hasTransport: !!(targetServer as ExtendedTargetServerZod).transport,
    });

    const client = new Client({
      name: `proxy-client-${targetServer.name}`,
      version: '1.0.0',
    });

    let transport;
    const extendedServer = targetServer as ExtendedTargetServerZod;

    // Check if this is an extended server config with auth/transport
    if (extendedServer.auth || extendedServer.transport) {
      // Use TransportFactory for new OAuth-enabled configurations
      const authProvider = this.createAuthProvider(
        extendedServer.auth,
        extendedServer.name,
      );

      // If transport is specified, use it; otherwise fall back to stdio from command
      const transportConfig = extendedServer.transport || {
        type: 'stdio' as const,
        command: extendedServer.command!,
        args: extendedServer.args,
        env: extendedServer.env,
      };

      transport = await this.transportFactory.createTransport(
        targetServer.name,
        transportConfig,
        authProvider,
      );
    } else {
      // Legacy path: use StdioClientTransport for backward compatibility
      const legacyServer = targetServer as TargetServer;
      if (!legacyServer.command) {
        throw new Error(`Server ${targetServer.name} missing command field`);
      }

      transport = new StdioClientTransport(targetServer.name, {
        command: legacyServer.command,
        args: legacyServer.args || [],
        env: { ...process.env, ...legacyServer.env } as Record<string, string>,
      });
    }

    await client.connect(transport);

    // Set up disconnect handling - listen for transport close events
    this.setupDisconnectHandling(targetServer, client, transport);

    // Track connection timestamp and transport reference
    const connectedAt = new Date().toISOString();
    this.connectionTimestamps.set(targetServer.name, connectedAt);
    this.transports.set(targetServer.name, transport);

    this.connectedServers.set(targetServer.name, targetServer);
    this.disconnectedServers.delete(targetServer.name); // Remove from disconnected if reconnecting
    this._clients.set(targetServer.name, client);

    console.error(`[proxy] Connected to: ${targetServer.name}`);
    logEvent('info', 'server:connect_success', {
      name: targetServer.name,
    });

    // Emit server connected event
    this.emit('server.connected', {
      serverName: targetServer.name,
      status: 'connected',
      timestamp: connectedAt,
    });

    // Discover tools from the newly connected server
    try {
      const response = await client.listTools();
      for (const tool of response.tools) {
        this.toolRegistry.registerDiscoveredTool({
          fullName: `${targetServer.name}__${tool.name}`,
          originalName: tool.name,
          serverName: targetServer.name,
          definition: tool,
          client,
        });
      }
    } catch (error) {
      console.error(
        `[proxy] Failed to discover tools from ${targetServer.name}:`,
        error,
      );
      logError('tools:discovery_failed', error, { server: targetServer.name });
    }
  }

  private async connectToTargetServers() {
    const connectionPromises = this._normalizedServers.map(
      async (targetServer) => {
        try {
          await this.connectToSingleServer(targetServer);
          return { name: targetServer.name, status: 'connected' as const };
        } catch (error) {
          // Enhanced error handling for authentication failures
          if (error instanceof AuthenticationError) {
            console.error(
              `[proxy] Authentication failed for ${targetServer.name}: ${error.message}`,
            );
            legacyErrorLog(error, 'auth-failed', targetServer.name);
            logError('auth-failed', error, {
              name: targetServer.name,
              // Security: Don't log sensitive auth details
              hasAuth: !!(targetServer as ExtendedTargetServerZod).auth,
              authType:
                (targetServer as ExtendedTargetServerZod).auth?.type || 'none',
            });
          } else {
            console.error(
              `[proxy] Failed to connect to ${targetServer.name}:`,
              error,
            );
            legacyErrorLog(error, 'connection-failed', targetServer.name);
            logError('connection-failed', error, {
              name: targetServer.name,
              command: targetServer.command,
              args: targetServer.args,
            });
          }
          // Do not throw; continue starting proxy with remaining servers
          return { name: targetServer.name, status: 'failed' as const, error };
        }
      },
    );

    const results = await Promise.allSettled(connectionPromises);
    const summary = results.map((r) =>
      r.status === 'fulfilled' ? r.value : r.reason,
    );
    logEvent('info', 'server:connect_summary', { summary });
  }

  getTargetServers() {
    return {
      connected: Array.from(this.connectedServers),
      disconnected: Array.from(this.disconnectedServers),
    };
  }

  /**
   * Get the status of a single server by name
   * Returns ServerStatus object with current connection state
   */
  getServerStatus(name: string): ServerStatus {
    // Check if server is connected
    if (this.connectedServers.has(name)) {
      const connectedAt = this.connectionTimestamps.get(name);
      return {
        name,
        status: 'connected',
        connectedAt,
      };
    }

    // Check if server is in disconnected state
    const disconnectedServer = this.disconnectedServers.get(name);
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
   * Reconnect to a disconnected server
   * Finds the server in disconnectedServers and attempts to reconnect
   */
  async reconnectServer(name: string): Promise<void> {
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
        this.emit('server.reconnecting', {
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
    await reconnectionPromise;
  }

  /**
   * Disconnect from a connected server
   * Closes the connection and moves server to disconnected state
   */
  async disconnectServer(name: string): Promise<void> {
    // Check if server is currently connected
    if (!this.connectedServers.has(name)) {
      throw new Error(`Server '${name}' is not currently connected`);
    }

    const targetServer = this.connectedServers.get(name)!;
    const client = this._clients.get(name);
    const transport = this.transports.get(name);

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
      this.handleServerDisconnection(targetServer, 'manual_disconnect');
    } catch (error) {
      console.error(`[proxy] Error during disconnection from ${name}:`, error);
      logError('server:disconnect_failed', error, { name });
      throw error;
    }
  }

  private async discoverAllTools() {
    // Discover from servers
    for (const [serverName, client] of this._clients) {
      try {
        const response = await client.listTools();
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
          `[proxy] Failed to discover tools from ${serverName}:`,
          error,
        );
        logError('tools:discovery_failed', error, { server: serverName });
      }
    }
  }

  private setupRequestHandlers() {
    this._server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Get all exposed tools from registry (including core tools)
      const tools = this.toolRegistry.getExposedTools();
      return { tools };
    });

    this._server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: toolArgs } = request.params;

      // Check core tools first
      const coreTool = this.coreTools.get(toolName);
      if (coreTool) {
        return coreTool.handle(toolArgs || {}, this.createToolContext());
      }

      // Get tool from registry
      const tool = this.toolRegistry.getToolForExecution(toolName);
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Tool not found: ${toolName}` }],
          isError: true,
        };
      }

      // Execute based on type
      if (tool.command) {
        return tool.command.executeToolViaMCP(
          tool.originalName,
          toolArgs || {},
        );
      }

      if (tool.client) {
        const result = await tool.client.callTool({
          name: tool.originalName,
          arguments: toolArgs || {},
        });
        return result;
      }

      return {
        content: [{ type: 'text', text: `Tool ${toolName} has no executor` }],
        isError: true,
      };
    });
  }

  async start(options?: ProxyStartOptions) {
    const transportOption = options?.transport ?? 'stdio';

    await this.initialize();

    if (transportOption === 'stdio') {
      const transport = new StdioServerTransport();
      await this._server.connect(transport);
      console.error('[proxy] Server started successfully');
      logEvent('info', 'proxy:started');
    }

    return this._server;
  }

  // Public getters for web UI and other integrations
  get config() {
    return this._config;
  }

  get clients() {
    return this._clients;
  }

  get toolMapping() {
    // Provide backward compatibility
    const mapping = new Map();
    for (const tool of this.toolRegistry.getAllTools()) {
      if (tool.discovered) {
        mapping.set(tool.fullName, {
          client: tool.client || null,
          originalName: tool.originalName,
          toolName: tool.originalName,
          command: tool.command,
        });
      }
    }
    return mapping;
  }

  get dynamicallyEnabledTools() {
    return new Set(
      this.toolRegistry
        .getAllTools()
        .filter((t) => t.enabled && t.enabledBy)
        .map((t) => t.fullName),
    );
  }

  get toolDescriptionCache() {
    return this.toolRegistry.getToolDescriptions();
  }

  get toolDefinitionCache() {
    return this.toolRegistry.getToolDefinitions();
  }

  get server() {
    return this._server;
  }

  get registry() {
    return this.toolRegistry;
  }

  /**
   * Complete OAuth2 authorization code flow
   * Uses O(1) static state lookup instead of O(n) iteration
   */
  async completeOAuthFlow(state: string, code: string): Promise<void> {
    // Use O(1) lookup to find the provider for this state
    const provider = OAuth2AuthCodeProvider.getProviderForState(state);

    if (!provider) {
      throw new Error('No matching OAuth flow found for this state parameter');
    }

    try {
      await provider.completeOAuthFlow(state, code);
      logEvent('info', 'proxy:oauth_completed', { state });

      // Attempt to reconnect servers if any are disconnected
      // This handles the case where auth completion enables connection
      setTimeout(() => this.connectToTargetServers(), 1000);
    } catch (error) {
      logEvent('error', 'proxy:oauth_completion_failed', {
        state,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// Export for library usage
export {
  ProxyConfigSchema,
  normalizeServers,
  normalizeExtendedServers,
} from './config.js';
export type { ProxyConfig, ServersRecord } from './config.js';
export type { ServerStatus } from './types/index.js';
