/**
 * Configuration utility functions for transport setup.
 * Handles environment variable resolution, legacy detection, and default application.
 */

import type { TransportConfig } from '../../types/transport.types.js';
import { TransportError } from '../errors/transport-error.js';
import {
  EnvironmentResolver,
  resolveEnvironmentVariables as resolveEnv,
} from '../../auth/implementations/environment-resolver.js';

/**
 * Legacy config type for stdio transport detection
 */
export interface LegacyConfig {
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
} as const;

/**
 * Resolves environment variables in configuration strings.
 * Supports nested variable resolution and validates variable existence.
 */
export function resolveEnvironmentVariables(
  config: TransportConfig | LegacyConfig,
): ResolvedConfig {
  const resolved = { ...config };

  // Helper function to resolve variables in a string
  const resolveString = (value: string): string => {
    try {
      return EnvironmentResolver.containsVariables(value)
        ? resolveEnv(value)
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
export function normalizeConfig(config: ResolvedConfig): TransportConfig {
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
 * Applies default values to configuration based on transport type.
 */
export function applyDefaults(config: TransportConfig): TransportConfig {
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
