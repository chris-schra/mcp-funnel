import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
  type CallToolResult,
  type Notification,
} from '@modelcontextprotocol/sdk/types.js';
import { ProxyConfig, normalizeServers, TargetServer } from './config.js';
import * as readline from 'readline';
import { spawn, ChildProcess } from 'child_process';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from './tools/core-tool.interface.js';
import { DiscoverToolsByWords } from './tools/discover-tools-by-words/index.js';
import { GetToolSchema } from './tools/get-tool-schema/index.js';
import { BridgeToolRequest } from './tools/bridge-tool-request/index.js';
import { LoadToolset } from './tools/load-toolset/index.js';
import { matchesPattern } from './utils/pattern-matcher.js';
import { discoverCommands, type ICommand } from '@mcp-funnel/commands-core';
import { writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logEvent, logError, getServerStreamLogPath } from './logger.js';

import Package from '../package.json';

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
  private _toolMapping: Map<
    string,
    { client: Client | null; originalName: string; command?: ICommand }
  > = new Map();
  private _dynamicallyEnabledTools: Set<string> = new Set();
  private _toolDescriptionCache: Map<
    string,
    { serverName: string; description: string }
  > = new Map();
  private _toolDefinitionCache: Map<
    string,
    { serverName: string; tool: Tool }
  > = new Map();
  private coreTools: Map<string, ICoreTool> = new Map();

  constructor(config: ProxyConfig) {
    this._config = config;
    this._normalizedServers = normalizeServers(config.servers);

    // Deprecation warning for legacy flags
    if (
      config.enableDynamicDiscovery !== undefined ||
      config.hackyDiscovery !== undefined
    ) {
      console.warn(
        '[proxy] enableDynamicDiscovery and hackyDiscovery are deprecated. Use exposeCoreTools instead.',
      );
    }

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
    await this.connectToTargetServers();
    await this.loadDevelopmentCommands();
    // Pre-populate caches so discovery/load operations work before first tools/list
    try {
      await this.populateToolCaches();
    } catch (error) {
      console.error('[proxy] Initial cache population failed:', error);
      logError('initial-cache-populate', error);
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

      const registry = await discoverCommands(commandsPath);
      const enabledCommands = this._config.commands.list || [];

      // Register each enabled command with cmd__ prefix
      for (const commandName of registry.getAllCommandNames()) {
        const command = registry.getCommandForMCP(commandName);
        if (
          command &&
          (enabledCommands.length === 0 ||
            enabledCommands.includes(command.name))
        ) {
          const prefixedName = `cmd__${command.name}`;
          const mcpDef = command.getMCPDefinition();

          // Add to command cache with prefix
          // Commands must have descriptions per their MCP definition
          if (!mcpDef.description) {
            throw new Error(
              `Command ${command.name} is missing a description in its MCP definition`,
            );
          }
          this._toolDescriptionCache.set(prefixedName, {
            serverName: 'development-commands',
            description: mcpDef.description,
          });

          this._toolDefinitionCache.set(prefixedName, {
            serverName: 'development-commands',
            tool: { ...mcpDef, name: prefixedName },
          });

          // Store mapping for execution
          this._toolMapping.set(prefixedName, {
            client: null, // Development commands don't use a client
            originalName: command.name,
            command, // Store the actual command instance
          });
        }
      }
    } catch (error) {
      console.error('Failed to load development commands:', error);
    }
  }

  private createToolContext(): CoreToolContext {
    return {
      toolDescriptionCache: this._toolDescriptionCache,
      toolDefinitionCache: this._toolDefinitionCache,
      toolMapping: this._toolMapping,
      dynamicallyEnabledTools: this._dynamicallyEnabledTools,
      config: this._config,
      enableTools: (toolNames: string[]) => {
        for (const toolName of toolNames) {
          this._dynamicallyEnabledTools.add(toolName);
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
        // Create a properly typed notification object that conforms to the Notification interface
        const notification: Notification = {
          method,
          ...(params !== undefined && { params }),
        };
        // Type assertion is required because the Server class restricts notifications to specific types,
        // but this function needs to support arbitrary custom notifications
        this._server.notification(notification as Notification);
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

  private shouldExposeTool(serverName: string, toolName: string): boolean {
    // Create the full tool name with server prefix
    const fullToolName = `${serverName}__${toolName}`;

    // Check if dynamically enabled
    if (this._dynamicallyEnabledTools.has(fullToolName)) {
      return true;
    }

    if (this._config.exposeTools) {
      // Check if tool matches any expose pattern (only checking prefixed name)
      return this._config.exposeTools.some((pattern) =>
        matchesPattern(fullToolName, pattern),
      );
    }
    if (this._config.hideTools) {
      // Check if tool matches any hide pattern (only checking prefixed name)
      return !this._config.hideTools.some((pattern) =>
        matchesPattern(fullToolName, pattern),
      );
    }
    return true;
  }

  private setupRequestHandlers() {
    this._server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools: Tool[] = [];

      // Add core tools
      for (const coreTool of this.coreTools.values()) {
        allTools.push(coreTool.tool);
      }

      for (const [serverName, client] of this._clients) {
        try {
          const response = await client.listTools();

          for (const tool of response.tools) {
            const fullToolName = `${serverName}__${tool.name}`;

            // Only cache tools that should be exposed according to filtering rules
            if (this.shouldExposeTool(serverName, tool.name)) {
              // Cache tool descriptions and definitions for discovery
              this._toolDescriptionCache.set(fullToolName, {
                serverName,
                description: tool.description || '',
              });
              this._toolDefinitionCache.set(fullToolName, {
                serverName,
                tool,
              });
            }

            // Always register in toolMapping for call handling (even for hidden tools)
            // This allows bridge_tool_request to work if a tool name is known
            this._toolMapping.set(fullToolName, {
              client,
              originalName: tool.name,
            });

            // If dynamic discovery is enabled, check if tool was dynamically enabled
            if (this._config.enableDynamicDiscovery) {
              if (!this._dynamicallyEnabledTools.has(fullToolName)) {
                continue; // Skip tools not yet enabled
              }
              // Tool was dynamically enabled, add it to the list
              allTools.push({
                ...tool,
                name: fullToolName,
                description: `[${serverName}] ${tool.description || ''}`,
              });
              continue;
            }

            // Check filtering against both the original tool name and the prefixed name
            if (this.shouldExposeTool(serverName, tool.name)) {
              allTools.push({
                ...tool,
                name: fullToolName,
                description: `[${serverName}] ${tool.description || ''}`,
              });
            }
          }
        } catch (error) {
          console.error(
            `[proxy] Failed to list tools from ${serverName}:`,
            error,
          );
          logError('tools:list_failed', error, { server: serverName });
        }
      }

      // Add development commands from cache
      for (const [toolName, definition] of this._toolDefinitionCache) {
        if (
          toolName.startsWith('cmd__') &&
          definition.serverName === 'development-commands'
        ) {
          // Check if command should be exposed based on configuration
          if (
            this.shouldExposeTool(
              'development-commands',
              toolName.replace('cmd__', ''),
            )
          ) {
            allTools.push(definition.tool);
          }
        }
      }

      logEvent('debug', 'tools:list_complete', { total: allTools.length });
      return { tools: allTools };
    });

    this._server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: toolArgs } = request.params;

      // Check if this is a development command
      if (toolName.startsWith('cmd__')) {
        const mapping = this._toolMapping.get(toolName);
        if (mapping && mapping.command) {
          try {
            logEvent('info', 'tool:call_dev', { name: toolName });
            const result = await mapping.command.executeViaMCP(toolArgs || {});
            return result;
          } catch (error) {
            logError('tool:dev_execution_failed', error, { name: toolName });
            return {
              content: [
                {
                  type: 'text',
                  text: `Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }
        }
      }

      // Handle core tools
      const coreTool = this.coreTools.get(toolName);
      if (coreTool) {
        logEvent('info', 'tool:call_core', { name: toolName });
        return coreTool.handle(toolArgs ?? {}, this.createToolContext());
      }

      const mapping = this._toolMapping.get(toolName);
      if (!mapping) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      if ('client' in mapping) {
        try {
          logEvent('info', 'tool:call_bridge', { name: toolName });
          if (!mapping.client) {
            throw new Error(`Tool ${toolName} has no client connection`);
          }
          const result = await mapping.client.callTool({
            name: mapping.originalName,
            arguments: toolArgs,
          });
          logEvent('debug', 'tool:result', { name: toolName });
          return result as CallToolResult;
        } catch (error) {
          console.error(`[proxy] Failed to call tool ${toolName}:`, error);
          logError('tool:call_failed', error, { name: toolName });
          throw error;
        }
      } else {
        throw new Error(`Invalid tool mapping for: ${toolName}`);
      }
    });
  }

  private async populateToolCaches() {
    for (const [serverName, client] of this._clients) {
      try {
        const response = await client.listTools();
        for (const tool of response.tools) {
          const fullToolName = `${serverName}__${tool.name}`;

          // Only cache tools that should be exposed according to filtering rules
          if (this.shouldExposeTool(serverName, tool.name)) {
            // Cache tool descriptions and definitions
            this._toolDescriptionCache.set(fullToolName, {
              serverName,
              description: tool.description || '',
            });
            this._toolDefinitionCache.set(fullToolName, {
              serverName,
              tool,
            });
          }

          // Always register in toolMapping for call handling (even for hidden tools)
          // This allows bridge_tool_request to work if a tool name is known
          this._toolMapping.set(fullToolName, {
            client,
            originalName: tool.name,
          });
        }
      } catch (error) {
        console.error(
          `[proxy] Failed to cache tools from ${serverName}:`,
          error,
        );
      }
    }
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
    return this._toolMapping;
  }

  get dynamicallyEnabledTools() {
    return this._dynamicallyEnabledTools;
  }

  get toolDescriptionCache() {
    return this._toolDescriptionCache;
  }

  get toolDefinitionCache() {
    return this._toolDefinitionCache;
  }

  get server() {
    return this._server;
  }
}

// Export for library usage
export { ProxyConfigSchema, normalizeServers } from './config.js';
export type { ProxyConfig, ServersRecord } from './config.js';
