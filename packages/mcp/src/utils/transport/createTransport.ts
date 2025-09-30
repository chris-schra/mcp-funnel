import type { TransportConfig } from '@mcp-funnel/models';
import {
  generateCacheKey,
  getCachedTransport,
  setCachedTransport,
  TransportFactoryDependencies,
} from './transport-cache.js';
import { TransportError } from '@mcp-funnel/core';
import { createTransportImplementation } from './createTransportImplementation.js';
import { validateTransportConfig } from '../validation/validateTransportConfig.js';
import type { FactoryTransport } from '../../types/index.js';
import { ConfigUtils } from '../ConfigUtils.js';
import { LegacyConfig } from './LegacyConfig.js';

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
    const resolvedConfig = ConfigUtils.resolveConfigFields(config);

    // Detect and normalize the configuration
    const normalizedConfig = ConfigUtils.normalizeConfig(resolvedConfig);

    // Validate the configuration
    validateTransportConfig(normalizedConfig);

    // Apply defaults based on transport type
    const configWithDefaults = ConfigUtils.applyDefaults(normalizedConfig);

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
