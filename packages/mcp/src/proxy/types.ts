// ChildProcess type removed - not used in interfaces
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  ReconnectionConfig,
  ConnectionStateChange,
} from '../reconnection-manager.js';
import type { TargetServer, ProxyConfig } from '../config.js';
import type { ICommand } from '@mcp-funnel/commands-core';

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
 */
export interface ILogger {
  error(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  logToFile(filename: string, content: string): void;
}

/**
 * SEAM: Environment resolver interface for different resolution strategies
 */
export interface IEnvironmentResolver {
  resolve(
    targetServer: TargetServer,
    config: ProxyConfig,
    configPath: string,
  ): Promise<Record<string, string>>;
}

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
