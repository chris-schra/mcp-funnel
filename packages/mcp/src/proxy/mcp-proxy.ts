import { EventEmitter } from 'events';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type Notification } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ProxyConfig } from '../config.js';
import { ToolRegistry } from '../tool-registry.js';
import { ICoreTool, CoreToolContext } from '../tools/core-tool.interface.js';
import { ServerStatus } from '../types/index.js';
import { logEvent } from '../logger.js';
import Package from '../../package.json';

// Import our new modular components
import {
  IConnectionManager,
  IAuthProviderFactory,
  ICommandLoader,
  IRequestHandler,
  ICoreToolManager,
} from './interfaces/index.js';
import {
  ConnectionManager,
  AuthProviderFactory,
  CommandLoader,
  RequestHandler,
  CoreToolManager,
} from './implementations/index.js';

declare global {
  var __mcpProxyInstance: MCPProxy | undefined;
}

export type ProxyStartOptions = {
  transport: 'stdio' | 'streamable-http';
};

export class MCPProxy extends EventEmitter {
  private _server: Server;
  private _config: ProxyConfig;
  private _configPath: string;
  private toolRegistry: ToolRegistry;
  private coreTools: Map<string, ICoreTool> = new Map();

  // Modular components (SEAMS principle - easily replaceable)
  private connectionManager: IConnectionManager;
  private authProviderFactory: IAuthProviderFactory;
  private commandLoader: ICommandLoader;
  private requestHandler: IRequestHandler;
  private coreToolManager: ICoreToolManager;

  constructor(config: ProxyConfig, configPath: string = process.cwd()) {
    super();
    this._config = config;
    this._configPath = configPath;
    this.toolRegistry = new ToolRegistry(config);

    // Expose instance on globalThis for hot-reload support (used by manage-commands tool)
    globalThis.__mcpProxyInstance = this;

    // Initialize modular components
    this.authProviderFactory = new AuthProviderFactory();
    this.connectionManager = new ConnectionManager(
      config,
      configPath,
      this.toolRegistry,
      this.authProviderFactory,
    );
    this.commandLoader = new CommandLoader();
    this.requestHandler = new RequestHandler();
    this.coreToolManager = new CoreToolManager();

    // Forward connection events
    this.connectionManager.on('server.connected', (event) =>
      this.emit('server.connected', event),
    );
    this.connectionManager.on('server.disconnected', (event) =>
      this.emit('server.disconnected', event),
    );
    this.connectionManager.on('server.reconnecting', (event) =>
      this.emit('server.reconnecting', event),
    );

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

  async initialize(): Promise<void> {
    // Register core tools
    this.coreTools = this.coreToolManager.registerCoreTools(
      this._config,
      this.toolRegistry,
      () => this.createToolContext(),
    );

    // Load commands and connect to servers in parallel
    await Promise.all([
      this.connectionManager.initialize(),
      this.commandLoader.loadDevelopmentCommands(
        this._config,
        this.toolRegistry,
      ),
    ]);

    // Set up request handlers
    this.requestHandler.setupRequestHandlers(
      this._server,
      this.coreTools,
      this.toolRegistry,
      () => this.createToolContext(),
    );
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
      configPath: this._configPath,
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

  // Server management methods (delegate to connection manager)
  getTargetServers() {
    const status = this.connectionManager.getConnectionStatus();
    return {
      connected: Array.from(status.connected.entries()).map(([name, conn]) => [
        name,
        conn.server,
      ]),
      disconnected: Array.from(status.disconnected.entries()).map(
        ([name, info]) => [name, info.server],
      ),
    };
  }

  getServerStatus(name: string): ServerStatus {
    return this.connectionManager.getServerStatus(name);
  }

  isServerConnected(name: string): boolean {
    return this.connectionManager.isServerConnected(name);
  }

  async reconnectServer(name: string): Promise<void> {
    return this.connectionManager.reconnectServer(name);
  }

  async disconnectServer(name: string): Promise<void> {
    return this.connectionManager.disconnectServer(name);
  }

  // OAuth flow completion (delegate to auth factory)
  async completeOAuthFlow(state: string, code: string): Promise<void> {
    await this.authProviderFactory.completeOAuthFlow(state, code);

    // Attempt to reconnect servers if any are disconnected
    // This handles the case where auth completion enables connection
    setTimeout(() => this.connectionManager.initialize(), 1000);
  }

  async start(options?: ProxyStartOptions): Promise<Server> {
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
  get config(): ProxyConfig {
    return this._config;
  }

  get clients(): Map<string, Client> {
    return this.connectionManager.getConnectedClients();
  }

  get toolMapping(): Map<string, any> {
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

  get dynamicallyEnabledTools(): Set<string> {
    return new Set(
      this.toolRegistry
        .getAllTools()
        .filter((t) => t.enabled && t.enabledBy)
        .map((t) => t.fullName),
    );
  }

  get toolDescriptionCache(): Map<
    string,
    { serverName: string; description: string }
  > {
    return this.toolRegistry.getToolDescriptions();
  }

  get toolDefinitionCache(): Map<string, any> {
    return this.toolRegistry.getToolDefinitions();
  }

  get server(): Server {
    return this._server;
  }

  get registry(): ToolRegistry {
    return this.toolRegistry;
  }

  // Cleanup method
  async destroy(): Promise<void> {
    await this.connectionManager.destroy();
    this.removeAllListeners();
  }

  // Internal access for testing (private fields that tests need to access)
  get ['transports'](): Map<string, any> {
    // For backward compatibility with existing tests
    const transports = new Map();
    const status = this.connectionManager.getConnectionStatus();
    for (const [name, connection] of status.connected) {
      transports.set(name, connection.transport);
    }
    return transports;
  }

  get ['connectedServers'](): Map<string, any> {
    // For backward compatibility with existing tests
    const servers = new Map();
    const status = this.connectionManager.getConnectionStatus();
    for (const [name, connection] of status.connected) {
      servers.set(name, connection.server);
    }
    return servers;
  }

  get ['disconnectedServers'](): Map<string, any> {
    // For backward compatibility with existing tests
    const servers = new Map();
    const status = this.connectionManager.getConnectionStatus();
    for (const [name, info] of status.disconnected) {
      servers.set(name, info.server);
    }
    return servers;
  }
}
