import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logError, logEvent, StdioClientTransport } from '@mcp-funnel/core';
import type {
  TargetServerZod,
  ProxyConfig,
  TargetServer,
} from '@mcp-funnel/schemas';
import { buildServerEnvironment } from '../../env/index.js';
import { createTransport } from '../../utils/transport/index.js';
import { createAuthProvider } from './auth-provider-factory.js';
import type { ToolRegistry } from '../../tool-registry/index.js';

/**
 * Configuration for establishing a server connection.
 * @public
 */
export interface ConnectionConfig {
  /** Server configuration (legacy or extended format) */
  targetServer: TargetServer | TargetServerZod;
  /** Proxy configuration containing global settings */
  config: ProxyConfig;
  /** Path to configuration file for resolving relative paths */
  configPath: string;
  /** Tool registry for registering discovered tools */
  toolRegistry: ToolRegistry;
}

/**
 * Result of a successful server connection.
 * @public
 */
export interface ConnectionResult {
  /** Connected MCP client instance */
  client: Client;
  /** Active transport for the connection */
  transport: Transport;
  /** ISO timestamp when connection was established */
  connectedAt: string;
}

/**
 * Builds environment variables for server connection with secret resolution.
 * SECURITY: Always uses buildServerEnvironment to ensure proper filtering of sensitive
 * variables and secret resolution from configured providers.
 * Handles both legacy (command/args at root) and extended (transport object) server formats.
 * @param {TargetServer | TargetServerZod} targetServer - Server configuration
 * @param {ProxyConfig} config - Proxy configuration
 * @param {string} configPath - Config file path for secret resolution
 * @returns {Promise<Record<string, string>>} Resolved environment variables map
 * @internal
 */
async function buildConnectionEnvironment(
  targetServer: TargetServer | TargetServerZod,
  config: ProxyConfig,
  configPath: string,
): Promise<Record<string, string>> {
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

  return buildServerEnvironment(targetForEnv, config, configPath);
}

/**
 * Creates a transport for server connection with authentication support.
 * Handles both extended transport configuration (SSE, WebSocket, stdio) and legacy
 * stdio-only format. Creates auth providers for OAuth2 and bearer token flows when configured.
 * @param {TargetServer | TargetServerZod} targetServer - Server configuration
 * @param {Record<string, string>} resolvedEnv - Resolved environment variables
 * @returns {Promise<Transport>} Configured transport instance
 * @throws {Error} When server has no command field in legacy format
 * @internal
 */
async function createServerTransport(
  targetServer: TargetServer | TargetServerZod,
  resolvedEnv: Record<string, string>,
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

  const authResult = createAuthProvider(
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
  }

  if (!legacyServer.command) {
    throw new Error(`Server ${targetServer.name} missing command field`);
  }

  return new StdioClientTransport(targetServer.name, {
    command: baseCommand,
    args: Array.isArray(baseArgs) ? baseArgs : [],
    env: resolvedEnv,
  });
}

/**
 * Discovers and registers tools from a connected server with timeout protection.
 * Calls client.listTools() with a 5-second timeout to prevent hanging if the server
 * crashes during discovery. Registers discovered tools with server name prefix.
 * @param {Client} client - Connected MCP client
 * @param {TargetServer | TargetServerZod} targetServer - Server configuration
 * @param {ToolRegistry} toolRegistry - Registry for storing discovered tools
 * @internal
 */
async function discoverServerTools(
  client: Client,
  targetServer: TargetServer | TargetServerZod,
  toolRegistry: ToolRegistry,
): Promise<void> {
  try {
    // Add timeout to prevent hanging if server crashes during discovery
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Tool discovery timeout')), 5000);
    });

    const response = await Promise.race([client.listTools(), timeoutPromise]);

    for (const tool of response.tools) {
      toolRegistry.registerDiscoveredTool({
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

/**
 * Establishes connection to a target server and discovers its tools.
 * Complete connection flow:
 * 1. Build environment variables with secret resolution
 * 2. Create transport with authentication support
 * 3. Connect MCP client to transport
 * 4. Discover and register server tools
 * Emits 'server:connect_start' and 'server:connect_success' events.
 * @param {ConnectionConfig} connectionConfig - Connection configuration
 * @returns {Promise<ConnectionResult>} Client, transport, and connection timestamp
 * @throws Various errors from transport creation, client connection, or tool discovery
 * @example
 * ```typescript
 * const result = await connectToServer({
 *   targetServer: { name: 'my-server', command: 'node', args: ['server.js'] },
 *   config: proxyConfig,
 *   configPath: '/path/to/config.json',
 *   toolRegistry
 * });
 * ```
 * @public
 * @see file:./server-connection-manager.ts:156 - Usage in connection manager
 */
export async function connectToServer(
  connectionConfig: ConnectionConfig,
): Promise<ConnectionResult> {
  const { targetServer, config, configPath, toolRegistry } = connectionConfig;

  logEvent('info', 'server:connect_start', {
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

  const resolvedEnv = await buildConnectionEnvironment(
    targetServer,
    config,
    configPath,
  );

  const transport = await createServerTransport(targetServer, resolvedEnv);

  await client.connect(transport);

  const connectedAt = new Date().toISOString();

  console.error(`[proxy] Connected to: ${targetServer.name}`);
  logEvent('info', 'server:connect_success', {
    name: targetServer.name,
  });

  // Discover tools from the newly connected server
  await discoverServerTools(client, targetServer, toolRegistry);

  return {
    client,
    transport,
    connectedAt,
  };
}
