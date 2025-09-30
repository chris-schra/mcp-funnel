/**
 * Utility functions for resolving secrets from provider configurations.
 *
 * This module provides helper functions to streamline secret resolution
 * across different parts of the application, following the DRY principle.
 */

import { SecretManager } from './secret-manager.js';
import { SecretProviderRegistry } from './secret-provider-registry.js';
import { createSecretProviders } from './provider-factory.js';
import type { SecretProviderConfig } from './provider-configs.js';
import { defaultLogger, type ILogger } from '../logger.js';

const secretManagerCache = new Map<string, SecretManager>();
const loggerIds = new WeakMap<ILogger, string>();
let loggerIdCounter = 0;

function getLoggerCacheId(logger: ILogger): string {
  if (logger === defaultLogger) {
    return 'default';
  }

  let id = loggerIds.get(logger);
  if (!id) {
    id = `logger-${++loggerIdCounter}`;
    loggerIds.set(logger, id);
  }

  return id;
}

function computeManagerCacheKey(
  providerConfigs: SecretProviderConfig[],
  configDir: string,
  logger: ILogger,
  rethrowErrors: boolean,
): string {
  const serializableConfigs = providerConfigs.map((config) => ({
    name: config.name ?? null,
    type: config.type,
    config: config.config,
  }));

  return JSON.stringify({
    configs: serializableConfigs,
    dir: configDir,
    logger: getLoggerCacheId(logger),
    rethrowErrors,
  });
}

/**
 * Options for secret resolution helper function.
 */
export interface ResolveSecretsOptions {
  /**
   * Custom logger instance. If not provided, uses the default logger.
   */
  logger?: ILogger;

  /**
   * Context information for logging purposes.
   */
  context?: {
    /**
     * The name/identifier for the context where secrets are being resolved.
     * Used in error messages for better debugging.
     */
    name: string;

    /**
     * Type of secret resolution (e.g., 'default', 'server-specific').
     * Used in error messages for clarity.
     */
    type?: string;
  };

  /**
   * Whether to rethrow errors instead of logging and returning empty object.
   * Default: false (errors are logged and empty object is returned)
   */
  rethrowErrors?: boolean;
}

/**
 * Resolves secrets from a provider configuration with consistent error handling.
 *
 * This helper function encapsulates the common pattern of:
 * 1. Creating providers from configuration
 * 2. Creating a SecretManager instance
 * 3. Resolving secrets
 * 4. Handling errors with appropriate logging
 *
 * @param providerConfigs - Array of secret provider configurations
 * @param configDir - Directory path for resolving relative paths in configurations
 * @param options - Additional options for resolution and logging
 * @returns Promise resolving to the secrets object, or empty object if resolution fails
 *
 * @example
 * ```typescript
 * // Resolve default secrets
 * const defaultSecrets = await resolveSecretsFromConfig(
 *   config.defaultSecretProviders,
 *   configDir,
 *   {
 *     context: { name: 'default', type: 'default secrets' },
 *   }
 * );
 *
 * // Resolve server-specific secrets
 * const serverSecrets = await resolveSecretsFromConfig(
 *   server.secretProviders,
 *   configDir,
 *   {
 *     context: { name: server.name, type: 'server-specific secrets' },
 *   }
 * );
 * ```
 */
export async function resolveSecretsFromConfig(
  providerConfigs: SecretProviderConfig[],
  configDir: string,
  options: ResolveSecretsOptions = {},
): Promise<Record<string, string>> {
  const logger = options.logger ?? defaultLogger;
  const context = options.context ?? { name: 'unknown' };
  const rethrowErrors = options.rethrowErrors ?? false;
  const cacheKey = computeManagerCacheKey(
    providerConfigs,
    configDir,
    logger,
    rethrowErrors,
  );

  try {
    const cachedManager = secretManagerCache.get(cacheKey);
    if (cachedManager) {
      return await cachedManager.resolveSecrets();
    }

    const providers = createSecretProviders(providerConfigs, configDir);
    const registry = new SecretProviderRegistry();
    let hasNamedProviders = false;

    providerConfigs.forEach((config, index) => {
      if (config.name) {
        registry.register(config.name, providers[index]);
        hasNamedProviders = true;
      }
    });

    const secretManager = new SecretManager(
      providers,
      hasNamedProviders ? registry : undefined,
      { logger },
    );
    secretManagerCache.set(cacheKey, secretManager);
    return await secretManager.resolveSecrets();
  } catch (error) {
    secretManagerCache.delete(cacheKey);
    const errorMessage = `Failed to resolve ${context.type || 'secrets'} for ${context.name}`;

    if (rethrowErrors) {
      logger.error(errorMessage, error, {
        context: context.name,
        type: context.type,
      });
      throw error;
    } else {
      logger.error(errorMessage, error, {
        context: context.name,
        type: context.type,
      });
      return {};
    }
  }
}

/**
 * Clears the in-memory cache of SecretManager instances.
 * Useful for testing or when configuration changes require fresh resolution.
 */
export function clearSecretManagerCache(): void {
  secretManagerCache.clear();
}
