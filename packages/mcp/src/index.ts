import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Notification,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ProxyConfig,
  normalizeExtendedServers,
  TargetServer,
} from './config.js';
import * as readline from 'readline';
import { spawn, ChildProcess } from 'child_process';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from './tools/core-tool.interface.js';
import { DiscoverToolsByWords } from './tools/discover-tools-by-words/index.js';
import { GetToolSchema } from './tools/get-tool-schema/index.js';
import { BridgeToolRequest } from './tools/bridge-tool-request/index.js';
import { LoadToolset } from './tools/load-toolset/index.js';
import { discoverCommands, type ICommand } from '@mcp-funnel/commands-core';
import { writeFileSync, mkdirSync, appendFileSync, Dirent } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logEvent, logError, getServerStreamLogPath } from './logger.js';
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

interface TransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// Custom transport that prefixes server stderr logs
export class PrefixedStdioClientTransport {
  private readonly _serverName: string;
  private process?: ChildProcess;
  private messageHandlers: ((message: JSONRPCMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];

  constructor(
    serverName: string,
    private options: TransportOptions,
  ) {
    this._serverName = serverName;
  }

  async start(): Promise<void> {
    try {
      // Spawn the process with full control over stdio
      this.process = spawn(this.options.command, this.options.args || [], {
        env: this.options.env,
        stdio: ['pipe', 'pipe', 'pipe'], // Full control over all streams
        cwd: process.cwd(), // Explicitly set cwd
      });
      logEvent('debug', 'transport:start', {
        server: this._serverName,
        command: this.options.command,
        args: this.options.args,
      });
    } catch (error) {
      console.error(`[${this._serverName}] Failed to spawn process:`, error);
      // Keep legacy error file + structured log
      legacyErrorLog(error, 'spawn-failed', this._serverName);
      logError('spawn-failed', error, {
        server: this._serverName,
        command: this.options.command,
        args: this.options.args,
      });
      throw error;
    }

    // Handle stderr with prefixing
    if (this.process.stderr) {
      const rl = readline.createInterface({
        input: this.process.stderr,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        if (line.trim()) {
          console.error(`[${this._serverName}] ${line}`);
          try {
            appendFileSync(
              getServerStreamLogPath(this._serverName, 'stderr'),
              `[${new Date().toISOString()}] ${line}\n`,
            );
          } catch {
            // Failed to append to stderr log file
          }
        }
      });
    }

    // Handle stdout for MCP protocol messages
    if (this.process.stdout) {
      const rl = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        if (line.trim()) {
          try {
            const message = JSON.parse(line) as JSONRPCMessage;
            this.messageHandlers.forEach((handler) => handler(message));
          } catch {
            // Not a JSON message, might be a log line that went to stdout
            console.error(`[${this._serverName}] ${line}`);
            try {
              appendFileSync(
                getServerStreamLogPath(this._serverName, 'stdout'),
                `[${new Date().toISOString()}] ${line}\n`,
              );
            } catch {
              // Failed to append to stdout log file
            }
            logEvent('debug', 'transport:nonjson_stdout', {
              server: this._serverName,
              line: line.slice(0, 200),
            });
          }
        }
      });
    }

    // Handle process errors and exit
    this.process.on('error', (error) => {
      console.error(`[${this._serverName}] Process error:`, error);
      legacyErrorLog(error, 'process-error', this._serverName);
      logError('process-error', error, { server: this._serverName });
      this.errorHandlers.forEach((handler) => handler(error));
    });

    this.process.on('close', (code, signal) => {
      if (code !== 0) {
        const errorMsg = `Process exited with code ${code}, signal ${signal}`;
        console.error(`[${this._serverName}] ${errorMsg}`);
        legacyErrorLog(
          { message: errorMsg, code, signal },
          'process-exit',
          this._serverName,
        );
        logError('process-exit', new Error(errorMsg), {
          server: this._serverName,
          code,
          signal,
        });
      }
      this.closeHandlers.forEach((handler) => handler());
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Transport not started');
    }
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  set onmessage(handler: (message: JSONRPCMessage) => void) {
    this.messageHandlers.push(handler);
  }

  set onerror(handler: (error: Error) => void) {
    this.errorHandlers.push(handler);
  }

  set onclose(handler: () => void) {
    this.closeHandlers.push(handler);
  }
}

export class MCPProxy {
  private _server: Server;
  private _clients: Map<string, Client> = new Map();
  private _config: ProxyConfig;
  private _normalizedServers: TargetServer[];
  private toolRegistry: ToolRegistry;
  private coreTools: Map<string, ICoreTool> = new Map();

  private connectedServers = new Map<string, TargetServer>();
  private disconnectedServers = new Map<
    string,
    TargetServer & { error?: string }
  >();

  constructor(config: ProxyConfig) {
    this._config = config;
    this._normalizedServers = normalizeExtendedServers(
      config.servers,
    ) as TargetServer[];
    this.toolRegistry = new ToolRegistry(config);

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

          const transport = new PrefixedStdioClientTransport(
            targetServer.name,
            {
              command: targetServer.command,
              args: targetServer.args || [],
              env: { ...process.env, ...targetServer.env } as Record<
                string,
                string
              >,
            },
          );

          await client.connect(transport);

          // TODO: handle disconnects
          this.connectedServers.set(targetServer.name, targetServer);

          this._clients.set(targetServer.name, client);
          console.error(`[proxy] Connected to: ${targetServer.name}`);
          logEvent('info', 'server:connect_success', {
            name: targetServer.name,
          });
          return { name: targetServer.name, status: 'connected' as const };
        } catch (error) {
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
}

// Export for library usage
export { ProxyConfigSchema, normalizeServers } from './config.js';
export type { ProxyConfig, ServersRecord } from './config.js';
