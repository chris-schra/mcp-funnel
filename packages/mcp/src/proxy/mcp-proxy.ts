import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Notification,
} from '@modelcontextprotocol/sdk/types.js';
import { ProxyConfig, normalizeServers, TargetServer } from '../config.js';
import { ICoreTool, CoreToolContext } from '../tools/core-tool.interface.js';
import { DiscoverToolsByWords } from '../tools/discover-tools-by-words/index.js';
import { GetToolSchema } from '../tools/get-tool-schema/index.js';
import { BridgeToolRequest } from '../tools/bridge-tool-request/index.js';
import { LoadToolset } from '../tools/load-toolset/index.js';
import { SearchRegistryTools } from '../tools/search-registry-tools/index.js';
import { GetServerInstallInfo } from '../tools/get-server-install-info/index.js';
import { discoverCommands, type ICommand } from '@mcp-funnel/commands-core';
import { Dirent } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logEvent, logError } from '../logger.js';
import { ToolRegistry } from '../tool-registry.js';
import type { ConnectionStateChange } from '../reconnection-manager.js';
import { resolveServerEnvironment } from './env.js';
import { createTransportFactory } from './transports.js';
import { logger, prefixedLog } from './logging.js';
import type {
  ServerConnectionState,
  IReconnectableTransport,
} from './types.js';
import Package from '../../package.json';

export class MCPProxy {
  private _server: Server;
  private _clients: Map<string, Client> = new Map();
  private _transports: Map<string, IReconnectableTransport> = new Map();
  private _config: ProxyConfig;
  private _configPath: string;
  private _normalizedServers: TargetServer[];
  private toolRegistry: ToolRegistry;
  private coreTools: Map<string, ICoreTool> = new Map();
  private transportFactory = createTransportFactory('stdio');

  // Server connection state management
  private serverState: ServerConnectionState = {
    connected: new Map(),
    disconnected: new Map(),
  };

  constructor(config: ProxyConfig, configPath: string) {
    this._config = config;
    this._configPath = configPath;
    this._normalizedServers = normalizeServers(config.servers);
    this.toolRegistry = new ToolRegistry(config);

    // Initialize all servers as disconnected
    this._normalizedServers.forEach((server) => {
      this.serverState.disconnected.set(server.name, server);
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
      await this.populateToolCaches();
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
      new SearchRegistryTools(),
      new GetServerInstallInfo(),
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

  /**
   * Register a command tool in the tool registry
   */
  private registerCommandTool(
    command: ICommand,
    enabledCommands: string[],
  ): void {
    if (enabledCommands.length > 0 && !enabledCommands.includes(command.name)) {
      return;
    }

    const mcpDefs = command.getMCPDefinitions();
    const isSingle = mcpDefs.length === 1;
    const singleMatchesCommand = isSingle && mcpDefs[0]?.name === command.name;

    for (const mcpDef of mcpDefs) {
      const useCompact = singleMatchesCommand && mcpDef.name === command.name;
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

  private async loadDevelopmentCommands(): Promise<void> {
    // Only load if explicitly enabled in config
    if (!this._config.commands?.enabled) return;

    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const commandsPath = join(__dirname, '../../../commands');

      const enabledCommands = this._config.commands.list || [];

      const registerFromRegistry = async (
        registry: Awaited<ReturnType<typeof discoverCommands>>,
      ) => {
        for (const commandName of registry.getAllCommandNames()) {
          const command = registry.getCommandForMCP(commandName);
          if (command) {
            this.registerCommandTool(command, enabledCommands);
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

      // 2) Zero-config auto-scan for installed command packages
      await this.loadInstalledCommandPackages(enabledCommands);
    } catch (error) {
      console.error('Failed to load commands:', error);
    }
  }

  private async loadInstalledCommandPackages(
    enabledCommands: string[],
  ): Promise<void> {
    try {
      const scopeDir = join(process.cwd(), 'node_modules', '@mcp-funnel');
      const { readdirSync, existsSync } = await import('fs');
      if (!existsSync(scopeDir)) return;

      const entries = readdirSync(scopeDir, { withFileTypes: true });
      const packageDirs = entries
        .filter((e: Dirent) => e.isDirectory() && e.name.startsWith('command-'))
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

          if (chosen) {
            this.registerCommandTool(chosen, enabledCommands);
          }
        } catch (_err) {
          // skip invalid package
          continue;
        }
      }
    } catch (_e) {
      // No scope directory or unreadable; ignore
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
          // Create a properly typed notification object
          const notification: Notification = {
            method,
            ...(params !== undefined && { params }),
          };
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

  private async connectToTargetServers() {
    const connectionPromises = this._normalizedServers.map(
      async (targetServer) => {
        try {
          logEvent('info', 'server:connect_start', {
            name: targetServer.name,
            command: targetServer.command,
            args: targetServer.args,
          });
          const client = new Client({
            name: `proxy-client-${targetServer.name}`,
            version: '1.0.0',
          });

          // Resolve environment variables using the new modular system
          const resolvedEnv = await resolveServerEnvironment(
            targetServer,
            this._config,
            this._configPath,
          );

          // Create transport using factory (SEAM for future transport types)
          const transport = this.transportFactory.create(targetServer.name, {
            command: targetServer.command,
            args: targetServer.args || [],
            env: resolvedEnv,
            reconnection: {
              initialDelay: 1000,
              maxDelay: 30000,
              backoffMultiplier: 2,
              maxRetries: 10,
              jitter: 0.25,
            },
            healthChecks: true,
            healthCheckInterval: 30000,
          });

          // Store transport for management
          this._transports.set(targetServer.name, transport);

          // Handle disconnection events
          transport.onDisconnection((stateChange) => {
            this.handleServerDisconnection(targetServer.name, stateChange);
          });

          await client.connect(transport);

          // Connection successful - update server tracking
          this.handleServerConnection(targetServer.name, targetServer);

          this._clients.set(targetServer.name, client);
          console.error(`[proxy] Connected to: ${targetServer.name}`);
          logEvent('info', 'server:connect_success', {
            name: targetServer.name,
          });
          return { name: targetServer.name, status: 'connected' as const };
        } catch (error) {
          const errorMsg = prefixedLog(
            targetServer.name,
            `Failed to connect: ${error}`,
          );
          logger.error(errorMsg, error, {
            serverName: targetServer.name,
            context: 'connection-failed',
            command: targetServer.command,
            args: targetServer.args,
          });
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

  private handleServerConnection(
    serverName: string,
    targetServer: TargetServer,
  ): void {
    // Move from disconnected to connected
    this.serverState.disconnected.delete(serverName);
    this.serverState.connected.set(serverName, targetServer);

    logEvent('info', 'server:reconnected', { name: serverName });

    // Rediscover tools from this server since it's now available
    this.rediscoverServerTools(serverName).catch((error) => {
      console.error(
        `[proxy] Failed to rediscover tools from ${serverName}:`,
        error,
      );
      logError('tools:rediscovery_failed', error, { server: serverName });
    });
  }

  private handleServerDisconnection(
    serverName: string,
    stateChange: ConnectionStateChange,
  ): void {
    const resolveTarget = (): TargetServer | undefined => {
      const existing =
        this.serverState.connected.get(serverName) ??
        this.serverState.disconnected.get(serverName) ??
        this._normalizedServers.find((server) => server.name === serverName);

      if (!existing) {
        return undefined;
      }

      const { error: _ignoredError, ...rest } = existing as TargetServer & {
        error?: string;
      };
      return { ...rest } as TargetServer;
    };

    if (stateChange.to === 'disconnected' || stateChange.to === 'failed') {
      const targetServer = resolveTarget();

      if (targetServer) {
        // Move from connected to disconnected state
        this.serverState.connected.delete(serverName);
        this.serverState.disconnected.set(serverName, {
          ...targetServer,
          error: stateChange.error?.message,
        });
      }

      logEvent('warn', 'server:disconnected', {
        name: serverName,
        retryCount: stateChange.retryCount,
        state: stateChange.to,
        error: stateChange.error?.message,
      });

      // Remove tools from this server since it's no longer available
      this.toolRegistry.removeServerTools(serverName);

      // Notify that tools have changed
      this.notifyToolListChanged('disconnected');
      return;
    }

    if (stateChange.to === 'connected') {
      const targetServer = resolveTarget();

      if (!targetServer) {
        console.warn(
          `[proxy] Received connected state for unknown server ${serverName}`,
        );
        return;
      }

      this.handleServerConnection(serverName, targetServer);
    }
  }

  private async rediscoverServerTools(serverName: string): Promise<void> {
    const client = this._clients.get(serverName);
    if (!client) {
      return;
    }

    try {
      const count = await this.refreshServerTools(serverName, client, {
        throwOnError: true,
      });

      // Notify that tools have changed
      this.notifyToolListChanged('rediscover');
      console.error(`[proxy] Rediscovered ${count} tools from ${serverName}`);
    } catch (error) {
      throw new Error(`Failed to rediscover tools: ${error}`);
    }
  }

  private notifyToolListChanged(reason: string): void {
    void this._server.sendToolListChanged().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[proxy] Failed to send tools/list_changed (${reason}): ${message}`,
      );
      logError('tools:list_changed_failed', error, { reason });
    });
  }

  getTargetServers() {
    return {
      connected: Array.from(this.serverState.connected),
      disconnected: Array.from(this.serverState.disconnected),
    };
  }

  async populateToolCaches(): Promise<void> {
    for (const [serverName, client] of this._clients) {
      await this.refreshServerTools(serverName, client);
    }
  }

  private async refreshServerTools(
    serverName: string,
    client: Client,
    options: { throwOnError?: boolean } = {},
  ): Promise<number> {
    try {
      const response = await client.listTools();
      for (const tool of response.tools) {
        const fullToolName = `${serverName}__${tool.name}`;

        this.toolRegistry.registerDiscoveredTool({
          fullName: fullToolName,
          originalName: tool.name,
          serverName,
          definition: tool,
          client,
        });
      }

      return response.tools.length;
    } catch (error) {
      console.error(
        `[proxy] Failed to discover tools from ${serverName}:`,
        error,
      );
      logError('tools:discovery_failed', error, { server: serverName });

      if (options.throwOnError) {
        throw new Error(
          `Failed to discover tools from ${serverName}: ${error}`,
        );
      }

      return 0;
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

  async start() {
    await this.initialize();
    const transport = new StdioServerTransport();
    await this._server.connect(transport);
    console.error('[proxy] Server started successfully');
    logEvent('info', 'proxy:started');
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
   * Check if a server is currently connected and available
   * @param name Server name to check
   */
  isServerConnected(name: string): boolean {
    // Check if server exists in connected servers Map
    return this.serverState.connected.has(name);
  }

  /**
   * Clean up all resources and connections
   */
  async cleanup(): Promise<void> {
    console.error('[proxy] Cleaning up all connections...');

    // Clean up all transports (which will handle reconnection cleanup)
    const cleanupPromises = Array.from(this._transports.values()).map(
      (transport) => transport.destroy(),
    );

    await Promise.allSettled(cleanupPromises);

    // Clear all maps
    this._clients.clear();
    this._transports.clear();
    this.serverState.connected.clear();
    this.serverState.disconnected.clear();

    console.error('[proxy] Cleanup completed');
    logEvent('info', 'proxy:cleanup_completed');
  }
}
