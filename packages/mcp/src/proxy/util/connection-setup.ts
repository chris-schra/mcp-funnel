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
 * Configuration for connecting to a single server
 */
export interface ConnectionConfig {
  targetServer: TargetServer | TargetServerZod;
  config: ProxyConfig;
  configPath: string;
  toolRegistry: ToolRegistry;
}

/**
 * Result of a successful server connection
 */
export interface ConnectionResult {
  client: Client;
  transport: Transport;
  connectedAt: string;
}

/**
 * Build the environment variables for a server connection
 * SECURITY: Always use buildServerEnvironment to ensure proper filtering
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
 * Create a transport for the server connection
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
 * Discover tools from a connected server with timeout
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
 * Connect to a single target server
 * Returns the client, transport, and connection timestamp
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
