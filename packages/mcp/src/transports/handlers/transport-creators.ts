/**
 * Transport creation handlers for different transport types.
 * Each handler is responsible for creating and configuring a specific transport implementation.
 */

import type { TransportConfig } from '../../types/transport.types.js';
import type { IAuthProvider } from '../../auth/interfaces/auth-provider.interface.js';
import type { ITokenStorage } from '../../auth/interfaces/token-storage.interface.js';
import { TransportError } from '../errors/transport-error.js';
import { StdioClientTransport } from '../implementations/stdio-client-transport.js';
import { SSEClientTransport } from '../implementations/sse-client-transport.js';
import { WebSocketClientTransport } from '../implementations/websocket-client-transport.js';
import { StreamableHTTPClientTransport } from '../implementations/streamable-http-client-transport.js';
import {
  TransportWrapper,
  type FactoryTransport,
} from '../utils/transport-wrapper.js';

/**
 * Dependencies that can be injected into transports
 */
export interface TransportFactoryDependencies {
  authProvider?: IAuthProvider;
  tokenStorage?: ITokenStorage;
}

/**
 * Default values for WebSocket transport configuration
 */
const DEFAULT_WEBSOCKET_CONFIG = {
  pingInterval: 30000,
} as const;

/**
 * Creates auth provider configuration object for transports that support it
 */
function createAuthProviderConfig(authProvider?: IAuthProvider) {
  if (!authProvider) return undefined;

  return {
    getAuthHeaders: () => authProvider.getHeaders(),
    refreshToken: authProvider.refresh
      ? () => authProvider.refresh!()
      : undefined,
  };
}

/**
 * Creates a stdio transport instance
 */
export function createStdioTransport(
  config: Extract<TransportConfig, { type: 'stdio' }>,
  dependencies?: TransportFactoryDependencies,
): FactoryTransport {
  const stdioTransport = new StdioClientTransport(`stdio-${config.command}`, {
    command: config.command,
    args: config.args,
    env: config.env,
  });

  return new TransportWrapper(
    stdioTransport,
    'stdio',
    config,
    dependencies?.authProvider,
    dependencies?.tokenStorage,
  );
}

/**
 * Creates an SSE transport instance
 */
export function createSSETransport(
  config: Extract<TransportConfig, { type: 'sse' }>,
  dependencies?: TransportFactoryDependencies,
): FactoryTransport {
  const sseTransport = new SSEClientTransport({
    url: config.url,
    timeout: config.timeout,
    authProvider: createAuthProviderConfig(dependencies?.authProvider),
    reconnect: config.reconnect,
  });

  return new TransportWrapper(
    sseTransport,
    'sse',
    config,
    dependencies?.authProvider,
    dependencies?.tokenStorage,
  );
}

/**
 * Creates a WebSocket transport instance
 */
export function createWebSocketTransport(
  config: Extract<TransportConfig, { type: 'websocket' }>,
  dependencies?: TransportFactoryDependencies,
): FactoryTransport {
  const wsTransport = new WebSocketClientTransport({
    url: config.url,
    timeout: config.timeout,
    authProvider: createAuthProviderConfig(dependencies?.authProvider),
    reconnect: config.reconnect,
    pingInterval: DEFAULT_WEBSOCKET_CONFIG.pingInterval,
  });

  return new TransportWrapper(
    wsTransport,
    'websocket',
    config,
    dependencies?.authProvider,
    dependencies?.tokenStorage,
  );
}

/**
 * Creates a StreamableHTTP transport instance
 */
export function createStreamableHTTPTransport(
  config: Extract<TransportConfig, { type: 'streamable-http' }>,
  dependencies?: TransportFactoryDependencies,
): FactoryTransport {
  const streamableHttpTransport = new StreamableHTTPClientTransport({
    url: config.url,
    timeout: config.timeout,
    authProvider: createAuthProviderConfig(dependencies?.authProvider),
    reconnect: config.reconnect,
    sessionId: config.sessionId,
  });

  return new TransportWrapper(
    streamableHttpTransport,
    'streamable-http',
    config,
    dependencies?.authProvider,
    dependencies?.tokenStorage,
  );
}

/**
 * Creates the appropriate transport implementation based on configuration.
 * Dispatches to type-specific creation functions.
 */
export async function createTransportImplementation(
  config: TransportConfig,
  dependencies?: TransportFactoryDependencies,
): Promise<FactoryTransport> {
  switch (config.type) {
    case 'stdio':
      return createStdioTransport(config, dependencies);
    case 'sse':
      return createSSETransport(config, dependencies);
    case 'websocket':
      return createWebSocketTransport(config, dependencies);
    case 'streamable-http':
      return createStreamableHTTPTransport(config, dependencies);
    default: {
      // Use exhaustive check to handle unknown transport types
      const _exhaustive: never = config;
      throw TransportError.protocolError(
        `Unsupported transport type: ${(_exhaustive as TransportConfig).type}`,
      );
    }
  }
}
