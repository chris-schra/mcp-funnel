/**
 * Transport factory for creating appropriate transport instances based on configuration.
 * Handles legacy detection, environment variable resolution, and dependency injection.
 */

import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type {
  TransportConfig,
  StdioTransportConfig,
  SSETransportConfig,
  WebSocketTransportConfig,
  StreamableHTTPTransportConfig,
} from '../types/transport.types.js';
import type { IAuthProvider } from '../auth/interfaces/auth-provider.interface.js';
import type { ITokenStorage } from '../auth/interfaces/token-storage.interface.js';
import { TransportError } from './errors/transport-error.js';
import { StdioClientTransport } from './implementations/stdio-client-transport.js';
import { SSEClientTransport } from './implementations/sse-client-transport.js';
import { WebSocketClientTransport } from './implementations/websocket-client-transport.js';
import { StreamableHTTPClientTransport } from './implementations/streamable-http-client-transport.js';
import { ValidationUtils } from '../utils/validation-utils.js';

/**
 * Dependencies that can be injected into transports
 */
export interface TransportFactoryDependencies {
  authProvider?: IAuthProvider;
  tokenStorage?: ITokenStorage;
}

/**
 * Extended transport interface that includes factory-specific properties
 */
export interface FactoryTransport extends Transport {
  type: string;
  config: TransportConfig;
  authProvider?: IAuthProvider;
  tokenStorage?: ITokenStorage;
  dispose: () => Promise<void>;
  isConnected: () => boolean;
}

/**
 * Wrapper class to add factory-specific methods to transport implementations
 */
class TransportWrapper implements FactoryTransport {
  public readonly type: string;
  public readonly config: TransportConfig;
  public readonly authProvider?: IAuthProvider;
  public readonly tokenStorage?: ITokenStorage;

  constructor(
    private transport: Transport,
    type: string,
    config: TransportConfig,
    authProvider?: IAuthProvider,
    tokenStorage?: ITokenStorage,
  ) {
    this.type = type;
    this.config = config;
    this.authProvider = authProvider;
    this.tokenStorage = tokenStorage;
  }

  // Delegate Transport interface methods
  get onclose() {
    return this.transport.onclose;
  }
  set onclose(value) {
    this.transport.onclose = value;
  }

  get onerror() {
    return this.transport.onerror;
  }
  set onerror(value) {
    this.transport.onerror = value;
  }

  get onmessage() {
    return this.transport.onmessage;
  }
  set onmessage(value) {
    this.transport.onmessage = value;
  }

  get sessionId() {
    return this.transport.sessionId;
  }
  set sessionId(value) {
    this.transport.sessionId = value;
  }

  async start() {
    return this.transport.start();
  }
  async send(message: JSONRPCMessage, options?: TransportSendOptions) {
    return this.transport.send(message, options);
  }
  async close() {
    return this.transport.close();
  }
  setProtocolVersion?(version: string) {
    if (this.transport.setProtocolVersion) {
      this.transport.setProtocolVersion(version);
    }
  }

  // Factory-specific methods
  async dispose(): Promise<void> {
    await this.close();
  }

  isConnected(): boolean {
    // Basic implementation - can be enhanced based on transport state
    // Type assertion for internal transport state properties
    const transportWithState = this.transport as {
      isStarted?: boolean;
      isClosed?: boolean;
    };
    return !!(transportWithState.isStarted && !transportWithState.isClosed);
  }
}

/**
 * Legacy config type for stdio transport detection
 */
interface LegacyConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;
  url?: string;
  timeout?: number;
  reconnect?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  };
}

/**
 * Config with resolved environment variables
 */
type ResolvedConfig = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;
  url?: string;
  timeout?: number;
  reconnect?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  };
};

/**
 * Transport instance cache for singleton behavior
 */
const transportCache = new Map<string, FactoryTransport>();

/**
 * WeakMaps to track unique IDs for provider/storage instances for cache key generation
 * This ensures different instances with the same configuration get separate cache entries
 */
const authProviderIds = new WeakMap<IAuthProvider, string>();
const tokenStorageIds = new WeakMap<ITokenStorage, string>();

/**
 * Counter for generating unique instance IDs
 */
let instanceIdCounter = 0;

/**
 * Gets or creates a unique ID for an auth provider instance
 */
function getAuthProviderInstanceId(provider: IAuthProvider): string {
  let id = authProviderIds.get(provider);
  if (!id) {
    id = `auth_provider_${++instanceIdCounter}`;
    authProviderIds.set(provider, id);
  }
  return id;
}

/**
 * Gets or creates a unique ID for a token storage instance
 */
function getTokenStorageInstanceId(storage: ITokenStorage): string {
  let id = tokenStorageIds.get(storage);
  if (!id) {
    id = `token_storage_${++instanceIdCounter}`;
    tokenStorageIds.set(storage, id);
  }
  return id;
}

/**
 * Default values for SSE transport configuration
 */
const DEFAULT_SSE_CONFIG = {
  timeout: 30000,
  reconnect: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },
} as const;

/**
 * Default values for WebSocket transport configuration
 */
const DEFAULT_WEBSOCKET_CONFIG = {
  timeout: 30000,
  reconnect: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 16000,
    backoffMultiplier: 2,
  },
  pingInterval: 30000,
} as const;

/**
 * Creates a transport instance based on configuration.
 * Supports environment variable resolution, legacy detection, and dependency injection.
 *
 * @param config - Transport configuration or legacy config
 * @param dependencies - Optional auth provider and token storage
 * @returns Promise resolving to transport instance
 */
export async function createTransport(
  config: TransportConfig | LegacyConfig,
  dependencies?: TransportFactoryDependencies,
): Promise<FactoryTransport> {
  try {
    // Resolve environment variables in the config
    const resolvedConfig = resolveEnvironmentVariables(config);

    // Detect and normalize the configuration
    const normalizedConfig = normalizeConfig(resolvedConfig);

    // Validate the configuration
    validateConfig(normalizedConfig);

    // Apply defaults based on transport type
    const configWithDefaults = applyDefaults(normalizedConfig);

    // Generate cache key for singleton behavior
    const cacheKey = generateCacheKey(configWithDefaults, dependencies);

    // Check if we already have this transport instance
    const cachedTransport = transportCache.get(cacheKey);
    if (cachedTransport) {
      return cachedTransport;
    }

    // Validate dependencies if auth provider or token storage is provided
    if (dependencies?.authProvider) {
      try {
        const isValid = await dependencies.authProvider.isValid();
        if (!isValid) {
          throw new Error('Auth provider configuration is not valid');
        }
      } catch (error) {
        throw TransportError.authenticationFailed(
          error instanceof Error ? error.message : 'Unknown error',
          error instanceof Error ? error : undefined,
        );
      }
    }

    if (dependencies?.tokenStorage) {
      try {
        await dependencies.tokenStorage.retrieve();
      } catch (error) {
        throw TransportError.serverError(
          `Failed to initialize token storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error instanceof Error ? error : undefined,
        );
      }
    }

    // Create appropriate transport based on type
    const transport = await createTransportImplementation(
      configWithDefaults,
      dependencies,
    );

    // Cache the transport for future requests
    transportCache.set(cacheKey, transport);

    return transport;
  } catch (error) {
    if (error instanceof TransportError) {
      throw error;
    }
    throw TransportError.serverError(
      `Failed to create transport: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Resolves environment variables in configuration strings.
 * Supports nested variable resolution and validates variable existence.
 */
function resolveEnvironmentVariables(
  config: TransportConfig | LegacyConfig,
): ResolvedConfig {
  const resolved = { ...config };

  // Helper function to resolve variables in a string
  const resolveString = (value: string): string => {
    try {
      return ValidationUtils.hasEnvironmentVariables(value)
        ? ValidationUtils.resolveEnvironmentVariables(value)
        : value;
    } catch (error) {
      throw TransportError.serverError(
        error instanceof Error
          ? error.message
          : 'Environment variable resolution failed',
      );
    }
  };

  // Resolve variables in command
  if ('command' in resolved && typeof resolved.command === 'string') {
    resolved.command = resolveString(resolved.command);
  }

  // Resolve variables in args
  if ('args' in resolved && Array.isArray(resolved.args)) {
    resolved.args = resolved.args.map((arg: string) =>
      typeof arg === 'string' ? resolveString(arg) : arg,
    );
  }

  // Resolve variables in URL
  if ('url' in resolved && typeof resolved.url === 'string') {
    resolved.url = resolveString(resolved.url);
  }

  // Merge environment variables
  if ('env' in resolved && resolved.env) {
    const mergedEnv: Record<string, string> = {};
    // Copy process.env, filtering out undefined values
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        mergedEnv[key] = value;
      }
    }
    // Override with config env
    Object.assign(mergedEnv, resolved.env);
    resolved.env = mergedEnv;
  }

  return resolved;
}

/**
 * Normalizes legacy configuration to modern transport configuration.
 * Handles legacy stdio detection based on command field presence.
 */
function normalizeConfig(config: ResolvedConfig): TransportConfig {
  // If type is explicitly set, use it
  if (config.type) {
    return config as TransportConfig;
  }

  // Legacy detection: command field indicates stdio transport
  if ('command' in config && config.command) {
    return {
      type: 'stdio' as const,
      command: config.command,
      args: config.args,
      env: config.env,
    };
  }

  // If no type and no command, this is an invalid config
  throw TransportError.protocolError(
    'Invalid configuration: must specify either type or command field',
  );
}

/**
 * Validates transport configuration based on type.
 */
function validateConfig(config: TransportConfig): void {
  switch (config.type) {
    case 'stdio':
      validateStdioConfig(config);
      break;
    case 'sse':
      validateSSEConfig(config);
      break;
    case 'websocket':
      validateWebSocketConfig(config);
      break;
    case 'streamable-http':
      validateStreamableHTTPConfig(config);
      break;
    default: {
      // Use exhaustive check to handle unknown transport types
      const _exhaustive: never = config;
      throw TransportError.protocolError(
        `Unsupported transport type: ${(_exhaustive as TransportConfig).type}`,
      );
    }
  }
}

/**
 * Validates stdio transport configuration.
 */
function validateStdioConfig(config: StdioTransportConfig): void {
  if (!config.command) {
    throw TransportError.protocolError(
      'Command is required for stdio transport',
    );
  }
}

/**
 * Validates SSE transport configuration.
 */
function validateSSEConfig(config: SSETransportConfig): void {
  if (!config.url) {
    throw TransportError.protocolError('URL is required for SSE transport');
  }

  // Validate URL format
  try {
    ValidationUtils.validateUrl(config.url, 'SSE URL');
  } catch (error) {
    throw TransportError.invalidUrl(
      config.url,
      error instanceof Error ? error : undefined,
    );
  }

  // Validate reconnect configuration
  if (config.reconnect) {
    validateReconnectConfig(config.reconnect);
  }
}

/**
 * Validates WebSocket transport configuration.
 */
function validateWebSocketConfig(config: WebSocketTransportConfig): void {
  if (!config.url) {
    throw TransportError.protocolError(
      'URL is required for WebSocket transport',
    );
  }

  // Validate URL format and protocol
  try {
    ValidationUtils.validateUrl(config.url, 'WebSocket URL');
    const url = new URL(config.url);
    const validProtocols = ['ws:', 'wss:', 'http:', 'https:'];
    if (!validProtocols.includes(url.protocol)) {
      throw TransportError.invalidUrl(
        config.url,
        new Error(
          'WebSocket URL must use ws:, wss:, http:, or https: protocol',
        ),
      );
    }
  } catch (error) {
    throw TransportError.invalidUrl(
      config.url,
      error instanceof Error ? error : undefined,
    );
  }

  // Validate reconnect configuration
  if (config.reconnect) {
    validateReconnectConfig(config.reconnect);
  }

  // Validate timeout
  if (config.timeout !== undefined && config.timeout <= 0) {
    throw TransportError.protocolError('timeout must be a positive number');
  }
}

/**
 * Validates StreamableHTTP transport configuration.
 */
function validateStreamableHTTPConfig(
  config: StreamableHTTPTransportConfig,
): void {
  if (!config.url) {
    throw TransportError.protocolError(
      'URL is required for StreamableHTTP transport',
    );
  }

  // Validate URL format and protocol
  try {
    ValidationUtils.validateUrl(config.url, 'StreamableHTTP URL');
    const url = new URL(config.url);
    const validProtocols = ['http:', 'https:'];
    if (!validProtocols.includes(url.protocol)) {
      throw TransportError.invalidUrl(
        config.url,
        new Error('StreamableHTTP URL must use http: or https: protocol'),
      );
    }
  } catch (error) {
    throw TransportError.invalidUrl(
      config.url,
      error instanceof Error ? error : undefined,
    );
  }

  // Validate reconnect configuration
  if (config.reconnect) {
    validateReconnectConfig(config.reconnect);
  }

  // Validate timeout
  if (config.timeout !== undefined && config.timeout <= 0) {
    throw TransportError.protocolError('timeout must be a positive number');
  }
}

/**
 * Validates reconnection configuration (shared by SSE, WebSocket, and StreamableHTTP).
 */
function validateReconnectConfig(reconnect: {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}): void {
  const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier } =
    reconnect;

  if (
    maxAttempts !== undefined &&
    (maxAttempts < 0 || !Number.isInteger(maxAttempts))
  ) {
    throw TransportError.protocolError('maxAttempts must be a positive number');
  }

  if (initialDelayMs !== undefined && initialDelayMs < 0) {
    throw TransportError.protocolError(
      'initialDelayMs must be a positive number',
    );
  }

  if (maxDelayMs !== undefined && maxDelayMs < 0) {
    throw TransportError.protocolError('maxDelayMs must be a positive number');
  }

  if (backoffMultiplier !== undefined && backoffMultiplier <= 1) {
    throw TransportError.protocolError(
      'backoffMultiplier must be greater than 1',
    );
  }
}

/**
 * Applies default values to configuration based on transport type.
 */
function applyDefaults(config: TransportConfig): TransportConfig {
  switch (config.type) {
    case 'stdio':
      return {
        ...config,
        args: config.args || [],
        env: config.env || {},
      };
    case 'sse':
      return {
        ...config,
        timeout: config.timeout ?? DEFAULT_SSE_CONFIG.timeout,
        reconnect: {
          ...DEFAULT_SSE_CONFIG.reconnect,
          ...config.reconnect,
        },
      };
    case 'websocket':
      return {
        ...config,
        timeout: config.timeout ?? DEFAULT_WEBSOCKET_CONFIG.timeout,
        reconnect: {
          ...DEFAULT_WEBSOCKET_CONFIG.reconnect,
          ...config.reconnect,
        },
      };
    case 'streamable-http':
      return {
        ...config,
        timeout: config.timeout ?? 30000,
        reconnect: config.reconnect
          ? {
              maxAttempts: config.reconnect.maxAttempts ?? 3,
              initialDelayMs: config.reconnect.initialDelayMs ?? 1000,
              maxDelayMs: config.reconnect.maxDelayMs ?? 30000,
              backoffMultiplier: config.reconnect.backoffMultiplier ?? 1.5,
            }
          : undefined,
      };
    default:
      return config;
  }
}

/**
 * Generates a cache key for transport singleton behavior.
 * Uses unique instance IDs to ensure different provider/storage instances
 * don't share cached transports even with identical configurations.
 */
function generateCacheKey(
  config: TransportConfig,
  dependencies?: TransportFactoryDependencies,
): string {
  const configKey = JSON.stringify(config);
  const authKey = dependencies?.authProvider
    ? `auth:${getAuthProviderInstanceId(dependencies.authProvider)}`
    : 'no-auth';
  const storageKey = dependencies?.tokenStorage
    ? `storage:${getTokenStorageInstanceId(dependencies.tokenStorage)}`
    : 'no-storage';
  return `${configKey}:${authKey}:${storageKey}`;
}

/**
 * Creates the actual transport implementation based on configuration.
 * Instantiates appropriate transport classes with dependency injection.
 */
async function createTransportImplementation(
  config: TransportConfig,
  dependencies?: TransportFactoryDependencies,
): Promise<FactoryTransport> {
  switch (config.type) {
    case 'stdio': {
      // Create stdio transport with process spawn configuration
      const stdioTransport = new StdioClientTransport(
        `stdio-${config.command}`,
        {
          command: config.command,
          args: config.args,
          env: config.env,
        },
      );

      return new TransportWrapper(
        stdioTransport,
        'stdio',
        config,
        dependencies?.authProvider,
        dependencies?.tokenStorage,
      );
    }

    case 'sse': {
      // Create SSE transport with OAuth configuration
      const sseTransport = new SSEClientTransport({
        url: config.url,
        timeout: config.timeout,
        authProvider: dependencies?.authProvider
          ? {
              getAuthHeaders: () => dependencies.authProvider!.getHeaders(),
              refreshToken: dependencies.authProvider.refresh
                ? () => dependencies.authProvider!.refresh!()
                : undefined,
            }
          : undefined,
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

    case 'websocket': {
      // Create WebSocket transport with OAuth configuration
      const wsTransport = new WebSocketClientTransport({
        url: config.url,
        timeout: config.timeout,
        authProvider: dependencies?.authProvider
          ? {
              getAuthHeaders: () => dependencies.authProvider!.getHeaders(),
              refreshToken: dependencies.authProvider.refresh
                ? () => dependencies.authProvider!.refresh!()
                : undefined,
            }
          : undefined,
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

    case 'streamable-http': {
      // Create StreamableHTTP transport with OAuth configuration
      const streamableHttpTransport = new StreamableHTTPClientTransport({
        url: config.url,
        timeout: config.timeout,
        authProvider: dependencies?.authProvider
          ? {
              getAuthHeaders: () => dependencies.authProvider!.getHeaders(),
              refreshToken: dependencies.authProvider.refresh
                ? () => dependencies.authProvider!.refresh!()
                : undefined,
            }
          : undefined,
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

    default: {
      // Use exhaustive check to handle unknown transport types
      const _exhaustive: never = config;
      throw TransportError.protocolError(
        `Unsupported transport type: ${(_exhaustive as TransportConfig).type}`,
      );
    }
  }
}

/**
 * Clears the transport cache. Useful for testing and cleanup.
 */
export function clearTransportCache(): void {
  transportCache.clear();
}

/**
 * Gets the current size of the transport cache.
 */
export function getTransportCacheSize(): number {
  return transportCache.size;
}
