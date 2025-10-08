import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  logError,
  logEvent,
  StdioClientTransport,
  type IAuthProvider,
  type ITokenStorage,
} from '@mcp-funnel/core';
import type { TargetServerZod, ProxyConfig, TargetServer } from '@mcp-funnel/schemas';
import type { TransportConfig } from '@mcp-funnel/models';
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
 * Extracted command and arguments from server configuration.
 * @internal
 */
interface CommandAndArgs {
  /** Extracted command string */
  command: string;
  /** Extracted arguments array */
  args: string[];
}

/**
 * Transport dependencies for authenticated connections.
 * @internal
 */
interface TransportDependencies {
  /** Authentication provider instance */
  authProvider: IAuthProvider;
  /** Token storage instance (undefined for bearer token auth) */
  tokenStorage?: ITokenStorage;
}

/**
 * Builds environment variables for server connection with secret resolution.
 * SECURITY: Always uses buildServerEnvironment to ensure proper filtering of sensitive
 * variables and secret resolution from configured providers.
 * Handles both legacy (command/args at root) and extended (transport object) server formats.
 * @param targetServer - Server configuration
 * @param config - Proxy configuration
 * @param configPath - Config file path for secret resolution
 * @returns Resolved environment variables map
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
    (extendedServer.transport?.type === 'stdio' ? extendedServer.transport.command : undefined) ??
    '';
  const baseArgs =
    legacyServer.args ??
    (extendedServer.transport?.type === 'stdio' ? extendedServer.transport.args : undefined) ??
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
 * Extracts command and args from server config, handling both legacy and extended formats.
 * @param legacyServer - Legacy server format
 * @param extendedServer - Extended server format
 * @returns Command and args tuple
 * @internal
 */
function extractCommandAndArgs(
  legacyServer: TargetServer,
  extendedServer: TargetServerZod,
): CommandAndArgs {
  const command =
    legacyServer.command ??
    (extendedServer.transport?.type === 'stdio' ? extendedServer.transport.command : undefined) ??
    '';

  const args =
    legacyServer.args ??
    (extendedServer.transport?.type === 'stdio' ? extendedServer.transport.args : undefined) ??
    [];

  return { command, args };
}

/**
 * Builds transport dependencies from auth provider result.
 * @param authResult - Result from createAuthProvider
 * @returns Transport dependencies or undefined
 * @internal
 */
function buildTransportDependencies(
  authResult: ReturnType<typeof createAuthProvider>,
): TransportDependencies | undefined {
  return authResult
    ? {
        authProvider: authResult.provider,
        tokenStorage: authResult.tokenStorage,
      }
    : undefined;
}

/**
 * Merges transport-specific environment with resolved environment.
 * @param transport - Transport configuration
 * @param resolvedEnv - Resolved environment variables
 * @returns Merged environment variables
 * @internal
 */
function mergeTransportEnvironment(
  transport: TargetServerZod['transport'],
  resolvedEnv: Record<string, string>,
): Record<string, string> {
  const explicitTransportEnv = transport && 'env' in transport ? (transport.env ?? {}) : {};

  return {
    ...resolvedEnv,
    ...explicitTransportEnv,
  };
}

/**
 * Builds transport configuration for extended server format.
 * @param extendedServer - Extended server configuration
 * @param legacyServer - Legacy server configuration
 * @param baseCommand - Extracted base command
 * @param baseArgs - Extracted base args
 * @param baseTransportEnv - Merged environment variables (only used for stdio)
 * @returns Transport configuration object
 * @internal
 */
function buildExtendedTransportConfig(
  extendedServer: TargetServerZod,
  legacyServer: TargetServer,
  baseCommand: string,
  baseArgs: string[],
  baseTransportEnv: Record<string, string>,
): TransportConfig {
  if (!extendedServer.transport) {
    throw new Error('Transport configuration missing');
  }

  if (extendedServer.transport.type === 'stdio') {
    return {
      ...extendedServer.transport,
      command: extendedServer.transport.command ?? legacyServer.command ?? baseCommand,
      args: extendedServer.transport.args ?? legacyServer.args ?? baseArgs,
      env: baseTransportEnv,
    };
  }

  // Non-stdio transports (SSE, WebSocket, StreamableHTTP) don't support env
  return extendedServer.transport;
}

/**
 * Creates a legacy stdio transport when no extended transport is configured.
 * @param targetServer - Server configuration
 * @param baseCommand - Extracted command
 * @param baseArgs - Extracted args
 * @param resolvedEnv - Resolved environment variables
 * @returns StdioClientTransport instance
 * @throws Error when command is missing
 * @internal
 */
function createLegacyStdioTransport(
  targetServer: TargetServer | TargetServerZod,
  baseCommand: string,
  baseArgs: string[],
  resolvedEnv: Record<string, string>,
): Transport {
  if (!baseCommand) {
    throw new Error(`Server ${targetServer.name} missing command field`);
  }

  return new StdioClientTransport(targetServer.name, {
    command: baseCommand,
    args: Array.isArray(baseArgs) ? baseArgs : [],
    env: resolvedEnv,
  });
}

/**
 * Creates a transport for server connection with authentication support.
 * Handles both extended transport configuration (SSE, WebSocket, stdio) and legacy
 * stdio-only format. Creates auth providers for OAuth2 and bearer token flows when configured.
 * @param targetServer - Server configuration
 * @param resolvedEnv - Resolved environment variables
 * @returns Configured transport instance
 * @throws Error when server has no command field in legacy format
 * @internal
 */
async function createServerTransport(
  targetServer: TargetServer | TargetServerZod,
  resolvedEnv: Record<string, string>,
): Promise<Transport> {
  const extendedServer = targetServer as TargetServerZod;
  const legacyServer = targetServer as TargetServer;

  const { command: baseCommand, args: baseArgs } = extractCommandAndArgs(
    legacyServer,
    extendedServer,
  );

  const authResult = createAuthProvider(extendedServer.auth, extendedServer.name, resolvedEnv);

  const transportDependencies = buildTransportDependencies(authResult);

  if (extendedServer.transport) {
    const baseTransportEnv = mergeTransportEnvironment(extendedServer.transport, resolvedEnv);

    const transportConfig = buildExtendedTransportConfig(
      extendedServer,
      legacyServer,
      baseCommand,
      baseArgs,
      baseTransportEnv,
    );

    return createTransport(transportConfig, transportDependencies);
  }

  return createLegacyStdioTransport(targetServer, baseCommand, baseArgs, resolvedEnv);
}

/**
 * Discovers and registers tools from a connected server with 5s timeout protection.
 * @param client - Connected MCP client
 * @param targetServer - Server configuration
 * @param toolRegistry - Registry for storing discovered tools
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
    console.error(`[proxy] Failed to discover tools from ${targetServer.name}:`, error);
    logError('tools:discovery_failed', error, { server: targetServer.name });
  }
}

/**
 * Establishes connection to a target server and discovers its tools.
 * Builds environment with secret resolution, creates transport with auth support,
 * connects MCP client, and discovers/registers server tools.
 * @param connectionConfig - Connection configuration
 * @returns Client, transport, and connection timestamp
 * @throws Various errors from transport creation, client connection, or tool discovery
 * @public
 * @see {@link ServerConnectionManager} - Usage in connection manager
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

  const resolvedEnv = await buildConnectionEnvironment(targetServer, config, configPath);

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
