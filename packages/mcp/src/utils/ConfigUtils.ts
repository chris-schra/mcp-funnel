import type { TransportConfig } from '@mcp-funnel/models';
import { EnvVarPatternResolver, TransportError } from '@mcp-funnel/core';
import type { LegacyConfig } from './transport/LegacyConfig.js';

/**
 * Resolves environment variable patterns in transport configuration strings.
 *
 * Processes string fields (command, args, url) for `$\{VAR_NAME\}` patterns
 * and replaces them with actual environment variable values.
 * @param config - Transport or legacy config with potential env var patterns
 * @returns Config with all env var patterns resolved to actual values
 * @throws TransportError when referenced environment variable doesn't exist
 * @internal
 * @see file:../../core/src/env/environment-resolver.ts - EnvVarPatternResolver implementation
 */
function resolveTransportConfigVars(
  config: TransportConfig | LegacyConfig,
): ResolvedConfig {
  const resolved = { ...config };

  // Helper function to resolve variables in a string
  const resolveString = (value: string): string => {
    try {
      return EnvVarPatternResolver.containsPattern(value)
        ? EnvVarPatternResolver.resolvePattern(value)
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
 * Transport configuration with resolved environment variables.
 * @internal
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
 * Normalizes legacy configuration to modern transport configuration.
 *
 * Legacy detection rules:
 * - Explicit type field: Use as-is
 * - Has command field: Infer as stdio transport
 * - No type and no command: Invalid configuration
 * @param config - Resolved config that may lack explicit type
 * @returns Normalized config with explicit type field
 * @throws TransportError when config has neither type nor command field
 * @internal
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
 * Default values for SSE transport configuration.
 * @internal
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
 * Default values for WebSocket transport configuration.
 * @internal
 */
const DEFAULT_WEBSOCKET_CONFIG = {
  timeout: 30000,
  reconnect: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 16000,
    backoffMultiplier: 2,
  },
} as const;

/**
 * Applies transport-specific default values to configuration.
 *
 * Each transport type has different defaults:
 * - stdio: Empty args/env objects
 * - sse: 30s timeout, reconnection with exponential backoff
 * - websocket: 30s timeout, reconnection with exponential backoff
 * - streamable-http: 30s timeout, optional reconnection
 * @param config - Transport config with explicit type
 * @returns Config with type-specific defaults applied
 * @internal
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

export const ConfigUtils = {
  normalizeConfig,
  resolveConfigFields: resolveTransportConfigVars,
  applyDefaults,
};
