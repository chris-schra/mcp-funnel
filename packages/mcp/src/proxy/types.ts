import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ICommand } from '@mcp-funnel/commands-core';
import type {
  ConnectionStateChange,
  ReconnectionConfig,
} from '@mcp-funnel/models';
import { ILogger } from '@mcp-funnel/core';
import type { TargetServer } from '@mcp-funnel/schemas';

/**
 * Base transport options for spawning server processes
 */
export interface TransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Enhanced transport options with reconnection and health check capabilities
 */
export interface ReconnectableTransportOptions extends TransportOptions {
  /** Reconnection configuration */
  reconnection?: ReconnectionConfig;
  /** Enable health checks via ping (default: true) */
  healthChecks?: boolean;
  /** Health check interval in milliseconds (default: 30000) */
  healthCheckInterval?: number;
}

/**
 * SEAM: Transport interface for future transport implementations
 * This allows for WebSocket, HTTP, or custom protocol transports
 */
export interface ITransport {
  start(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  close(): Promise<void>;
  set onmessage(handler: (message: JSONRPCMessage) => void);
  set onerror(handler: (error: Error) => void);
  set onclose(handler: () => void);
}

/**
 * SEAM: Logger interface for extensible logging strategies
 * Imported from core for consistency across packages
 */
export type { ILogger } from '@mcp-funnel/core';

/**
 * Server connection state tracking
 */
export interface ServerConnectionState {
  connected: Map<string, TargetServer>;
  disconnected: Map<string, TargetServer & { error?: string }>;
}

/**
 * Tool information stored in registry
 */
export interface ToolInfo {
  fullName: string;
  originalName: string;
  serverName: string;
  definition: unknown;
  client?: Client;
  command?: ICommand;
  isCoreTool?: boolean;
  enabled?: boolean;
  enabledBy?: string;
  discovered?: boolean;
}

/**
 * SEAM: Transport factory for creating different transport types
 */
export interface ITransportFactory {
  create(
    serverName: string,
    options: ReconnectableTransportOptions,
  ): IReconnectableTransport;
}

/**
 * Error context for structured logging
 */
export interface ErrorContext {
  timestamp: string;
  context: string;
  serverName?: string;
  message: string;
  stack?: string;
  code?: string;
  syscall?: string;
  path?: string;
  processInfo?: {
    pid: number;
    argv: string[];
    cwd: string;
    env: Record<string, string | undefined>;
  };
}

/**
 * Stream handler configuration
 */
export interface StreamHandlerConfig {
  serverName: string;
  stream: NodeJS.ReadableStream;
  streamType: 'stdout' | 'stderr';
  onLine: (line: string) => void;
  logger?: ILogger;
}

/**
 * Reconnectable transport interface extending base transport
 */
export interface IReconnectableTransport extends ITransport {
  readonly connectionState: string;
  readonly retryCount: number;
  reconnect(): Promise<void>;
  onDisconnection(handler: (state: ConnectionStateChange) => void): void;
  removeDisconnectionHandler(
    handler: (state: ConnectionStateChange) => void,
  ): void;
  destroy(): Promise<void>;
}
