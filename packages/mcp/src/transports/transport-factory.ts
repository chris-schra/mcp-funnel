/**
 * Transport factory for creating appropriate transport instances based on configuration.
 * Handles legacy detection, environment variable resolution, and dependency injection.
 */

import type { TransportConfig } from '../types/transport.types.js';
import { TransportError } from './errors/transport-error.js';
import { type FactoryTransport } from './utils/transport-wrapper.js';
import {
  type LegacyConfig,
  resolveEnvironmentVariables,
  normalizeConfig,
  applyDefaults,
} from './utils/config-utils.js';
import { validateConfig } from './utils/config-validator.js';
import {
  type TransportFactoryDependencies,
  generateCacheKey,
  getCachedTransport,
  setCachedTransport,
} from './utils/transport-cache.js';
import { createTransportImplementation } from './handlers/transport-creators.js';

// Re-export interfaces and types for backward compatibility
export type { FactoryTransport } from './utils/transport-wrapper.js';
export type { TransportFactoryDependencies } from './utils/transport-cache.js';
export type { LegacyConfig } from './utils/config-utils.js';

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
    const cachedTransport = getCachedTransport(cacheKey);
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
    setCachedTransport(cacheKey, transport);

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

// Re-export cache utilities for backward compatibility
export {
  clearTransportCache,
  getTransportCacheSize,
} from './utils/transport-cache.js';
