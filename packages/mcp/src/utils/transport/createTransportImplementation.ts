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
 * Default values for WebSocket transport configuration.
 * @internal
 */
const DEFAULT_WEBSOCKET_CONFIG = {
  pingInterval: 30000,
} as const;

/**
 * Creates a stdio transport instance for local process communication.
 *
 * Spawns a child process with the specified command and communicates via stdin/stdout.
 * @param config - Stdio transport configuration with command and args
 * @param dependencies - Optional auth provider and token storage (typically unused for stdio)
 * @returns Wrapped stdio transport instance
 * @public
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
 * Creates an SSE (Server-Sent Events) transport instance for server communication.
 *
 * Establishes a one-way streaming connection from server to client, with separate
 * HTTP POST for client-to-server messages.
 * @param config - SSE transport configuration with URL and optional timeout
 * @param dependencies - Optional auth provider for authenticated connections
 * @returns Wrapped SSE transport instance
 * @public
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
 * Creates a WebSocket transport instance for bidirectional server communication.
 *
 * Establishes a persistent WebSocket connection with automatic ping/pong for keepalive.
 * @param config - WebSocket transport configuration with URL and optional timeout
 * @param dependencies - Optional auth provider for authenticated connections
 * @returns Wrapped WebSocket transport instance
 * @public
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
 * Creates a StreamableHTTP transport instance for streaming HTTP communication.
 *
 * Uses HTTP with streaming responses for efficient message delivery while maintaining
 * request/response semantics.
 * @param config - StreamableHTTP transport configuration with URL and sessionId
 * @param dependencies - Optional auth provider for authenticated connections
 * @returns Wrapped StreamableHTTP transport instance
 * @public
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
 * Creates the appropriate transport implementation based on configuration type.
 *
 * Dispatches to type-specific creation functions based on config.type.
 * Uses exhaustive type checking to ensure all transport types are handled.
 * @param config - Transport configuration with discriminated type field
 * @param dependencies - Optional auth provider and token storage
 * @returns Wrapped transport instance for the specified type
 * @throws {TransportError} When transport type is unsupported
 * @public
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
