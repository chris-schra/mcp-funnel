import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'events';

import { ICoreTool } from '../tools/core-tool.interface.js';
import { DiscoverToolsByWords } from '../tools/discover-tools-by-words/index.js';
import { GetToolSchema } from '../tools/get-tool-schema/index.js';
import { BridgeToolRequest } from '../tools/bridge-tool-request/index.js';
import { LoadToolset } from '../tools/load-toolset/index.js';
import { ManageCommands } from '../tools/manage-commands/index.js';
import { loadDevelopmentCommands } from './command-loader.js';
import { ToolRegistry } from '../tool-registry/index.js';

import Package from '../../package.json';
import { logEvent } from '@mcp-funnel/core';
import type { ProxyConfig, TargetServer } from '@mcp-funnel/schemas';
import type { ServerStatus } from '@mcp-funnel/models';
import { normalizeServers } from '../utils/normalizeServers.js';
import { ServerConnectionManager } from './util/server-connection-manager.js';
import { createToolContext } from './util/tool-context-factory.js';
import {
  getServerStatus,
  isServerConnected,
  getTargetServers,
} from './util/server-status.js';
import { OAuth2AuthCodeProvider } from '@mcp-funnel/auth';

declare global {
  var __mcpProxyInstance: MCPProxy | undefined;
}

/**
 * Options for starting the MCP proxy server
 * @public
 */
export type ProxyStartOptions = {
  transport: 'stdio' | 'streamable-http';
};

/**
 * Main MCP proxy server that connects to multiple MCP servers
 * and exposes their tools through a unified interface.
 * @example
 * ```typescript
 * const proxy = new MCPProxy(config, './config.json');
 * await proxy.start({ transport: 'stdio' });
 * ```
 * @public
 */
export class MCPProxy extends EventEmitter {
  private _server: Server;
  private _clients: Map<string, Client> = new Map();
  private _config: ProxyConfig;
  private _configPath: string;
  private _normalizedServers: TargetServer[];
  private toolRegistry: ToolRegistry;
  private coreTools: Map<string, ICoreTool> = new Map();
  private connectionManager: ServerConnectionManager;

  public constructor(config: ProxyConfig, configPath: string = process.cwd()) {
    super();
    this._config = config;
    this._configPath = configPath;
    this._normalizedServers = normalizeServers(config.servers);
    this.toolRegistry = new ToolRegistry(config);

    // Expose instance on globalThis for hot-reload support (used by manage-commands tool)
    globalThis.__mcpProxyInstance = this;

    // Initialize connection manager
    this.connectionManager = new ServerConnectionManager(
      config,
      configPath,
      this._clients,
      this.toolRegistry,
      this,
    );

    // Initialize disconnected servers list
    this.connectionManager.initializeDisconnectedServers(
      this._normalizedServers,
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

  public async initialize() {
    this.registerCoreTools();

    await Promise.all([
      this.connectionManager.connectToTargetServers(this._normalizedServers),
      loadDevelopmentCommands(this._config, this.toolRegistry),
    ]);

    // Tools are already discovered during connectToSingleServer
    // No need to re-discover them here
    this.setupRequestHandlers();
  }

  private registerCoreTools() {
    const tools: ICoreTool[] = [
      new DiscoverToolsByWords(),
      new GetToolSchema(),
      new BridgeToolRequest(),
      new LoadToolset(),
      new ManageCommands(),
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
          tool.onInit(
            createToolContext(
              this.toolRegistry,
              this._config,
              this._configPath,
              this._server,
            ),
          );
        }
        console.error(`[proxy] Registered core tool: ${tool.name}`);
      }
    }
  }

  public getTargetServers() {
    return getTargetServers(
      this.connectionManager.getConnectedServers(),
      this.connectionManager.getDisconnectedServers(),
    );
  }

  /**
   * Get the status of a single server by name
   * Returns ServerStatus object with current connection state
   * @param name - Server name to query
   * @returns Server status object with connection state
   * @public
   */
  public getServerStatus(name: string): ServerStatus {
    return getServerStatus(
      name,
      this.connectionManager.getConnectedServers(),
      this.connectionManager.getDisconnectedServers(),
      this.connectionManager.getConnectionTimestamps(),
    );
  }

  /**
   * Check if a server is currently connected
   * @param name - Server name to check
   * @returns True if server is connected, false otherwise
   * @public
   */
  public isServerConnected(name: string): boolean {
    return isServerConnected(
      name,
      this.connectionManager.getConnectedServers(),
    );
  }

  /**
   * Reconnect to a disconnected server
   * Finds the server in disconnectedServers and attempts to reconnect
   * @param name - Server name to reconnect
   * @returns Promise that resolves when reconnection is complete
   * @public
   */
  public async reconnectServer(name: string): Promise<void> {
    return this.connectionManager.reconnectServer(name);
  }

  /**
   * Disconnect from a connected server
   * Closes the connection and moves server to disconnected state
   * @param name - Server name to disconnect
   * @returns Promise that resolves when disconnection is complete
   * @public
   */
  public async disconnectServer(name: string): Promise<void> {
    return this.connectionManager.disconnectServer(name);
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
        return coreTool.handle(
          toolArgs || {},
          createToolContext(
            this.toolRegistry,
            this._config,
            this._configPath,
            this._server,
          ),
        );
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

  public async start(options?: ProxyStartOptions) {
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
  public get config() {
    return this._config;
  }

  public get clients() {
    return this._clients;
  }

  public get toolMapping() {
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

  public get dynamicallyEnabledTools() {
    return new Set(
      this.toolRegistry
        .getAllTools()
        .filter((t) => t.enabled && t.enabledBy)
        .map((t) => t.fullName),
    );
  }

  public get toolDescriptionCache() {
    return this.toolRegistry.getToolDescriptions();
  }

  public get toolDefinitionCache() {
    return this.toolRegistry.getToolDefinitions();
  }

  public get server() {
    return this._server;
  }

  public get registry() {
    return this.toolRegistry;
  }

  // Backward compatibility for tests that access private fields
  private get transports() {
    return this.connectionManager.getTransports();
  }

  private get reconnectionManagers() {
    return this.connectionManager.getReconnectionManagers();
  }

  private createToolContext() {
    return createToolContext(
      this.toolRegistry,
      this._config,
      this._configPath,
      this._server,
    );
  }

  /**
   * Complete OAuth2 authorization code flow
   * Uses O(1) static state lookup instead of O(n) iteration
   * @param state - OAuth state parameter from callback
   * @param code - OAuth authorization code from callback
   * @public
   */
  public async completeOAuthFlow(state: string, code: string): Promise<void> {
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
      setTimeout(
        () =>
          this.connectionManager.connectToTargetServers(
            this._normalizedServers,
          ),
        1000,
      );
    } catch (error) {
      logEvent('error', 'proxy:oauth_completion_failed', {
        state,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
