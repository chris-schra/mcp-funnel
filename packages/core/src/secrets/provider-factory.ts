/**
 * Factory functions for creating secret providers from configuration.
 *
 * This module provides utilities to instantiate secret providers based on
 * configuration objects, following the factory pattern for type-safe creation.
 * @public
 */

import type { SecretProviderConfig } from './provider-configs.js';
import type { ISecretProvider } from './types.js';
import { DotEnvProvider } from './providers/dotenv/index.js';
import { ProcessEnvProvider } from './process-env-provider.js';
import { InlineProvider } from './inline-provider.js';

/**
 * Creates a secret provider instance from a configuration object.
 *
 * Uses TypeScript's discriminated union to ensure type-safe provider instantiation.
 * The configFileDir parameter is used to resolve relative paths in dotenv configurations.
 * @param config - Provider configuration with type discriminator
 * @param configFileDir - Directory path of the config file (for resolving relative paths)
 * @throws {Error} When an unknown provider type is specified
 * @example
 * ```typescript
 * const envProvider = createSecretProvider({
 *   type: 'process',
 *   config: { prefix: 'MCP_' }
 * });
 *
 * const fileProvider = createSecretProvider({
 *   type: 'dotenv',
 *   config: { path: '.env.local' }
 * }, '/path/to/config/dir');
 * ```
 * @public
 */
export function createSecretProvider(
  config: SecretProviderConfig,
  configFileDir?: string,
): ISecretProvider {
  switch (config.type) {
    case 'dotenv':
      return new DotEnvProvider(config.config, configFileDir);

    case 'process':
      return new ProcessEnvProvider(config);

    case 'inline':
      return new InlineProvider(config);

    default: {
      // TypeScript exhaustiveness check - this should never happen
      const exhaustiveCheck: never = config;
      throw new Error(
        `Unknown secret provider type: ${JSON.stringify(exhaustiveCheck)}`,
      );
    }
  }
}

/**
 * Creates multiple secret provider instances from an array of configurations.
 *
 * Convenience function for batch creation of providers. Providers are created
 * in the order they appear in the array, which determines their precedence
 * in the SecretManager.
 * @param configs - Array of provider configurations
 * @param configFileDir - Directory path of the config file (for resolving relative paths)
 * @example
 * ```typescript
 * const providers = createSecretProviders([
 *   { type: 'process', config: { prefix: 'MCP_' } },
 *   { type: 'dotenv', config: { path: '.env' } },
 *   { type: 'inline', config: { values: { DEFAULT_API: 'localhost' } } }
 * ]);
 * ```
 * @public
 */
export function createSecretProviders(
  configs: SecretProviderConfig[],
  configFileDir?: string,
): ISecretProvider[] {
  return configs.map((config) => createSecretProvider(config, configFileDir));
}

/**
 * Validates that a provider configuration is well-formed.
 *
 * Performs runtime validation beyond TypeScript's compile-time checks.
 * Useful for validating dynamically loaded configurations.
 * @param config - Provider configuration to validate
 * @throws {Error} When the configuration is invalid
 * @public
 */
export function validateSecretProviderConfig(
  config: unknown,
): config is SecretProviderConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Secret provider config must be an object');
  }

  const typedConfig = config as Partial<SecretProviderConfig>;

  if (!typedConfig.type) {
    throw new Error('Secret provider config must have a type field');
  }

  if (!typedConfig.config || typeof typedConfig.config !== 'object') {
    throw new Error('Secret provider config must have a config field');
  }

  switch (typedConfig.type) {
    case 'dotenv':
      if (typeof typedConfig.config.path !== 'string') {
        throw new Error('DotEnv provider config must have a path string');
      }
      break;

    case 'process':
      // Process provider config is optional, so any object is valid
      break;

    case 'inline':
      if (
        !typedConfig.config.values ||
        typeof typedConfig.config.values !== 'object'
      ) {
        throw new Error('Inline provider config must have a values object');
      }
      break;

    default:
      throw new Error(`Unknown secret provider type: ${typedConfig.type}`);
  }

  return true;
}
