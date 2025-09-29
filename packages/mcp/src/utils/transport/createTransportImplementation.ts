import type { TransportConfig } from '@mcp-funnel/models';
import type { FactoryTransport } from '../../types/index.js';
import {
  SSEClientTransport,
  StdioClientTransport,
  StreamableHTTPClientTransport,
  TransportError,
  WebSocketClientTransport,
} from '@mcp-funnel/core';
import { TransportWrapper } from './TransportWrapper.js';
import type { TransportFactoryDependencies } from './transport-cache.js';

/**
 * Default values for WebSocket transport configuration
 */
const DEFAULT_WEBSOCKET_CONFIG = {
  pingInterval: 30000,
} as const;

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
    authProvider: dependencies?.authProvider,
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
    authProvider: dependencies?.authProvider,
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
    authProvider: dependencies?.authProvider,
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
