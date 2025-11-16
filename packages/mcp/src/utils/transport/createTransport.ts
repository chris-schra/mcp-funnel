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
 * Validates the auth provider if present in dependencies.
 * @param authProvider - The auth provider to validate
 * @throws TransportError if auth provider is invalid or validation fails
 */
async function validateAuthProvider(
  authProvider: TransportFactoryDependencies['authProvider'],
): Promise<void> {
  if (!authProvider) {
    return;
  }

  try {
    const isValid = await authProvider.isValid();
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

/**
 * Validates the token storage if present in dependencies.
 * @param tokenStorage - The token storage to validate
 * @throws TransportError if token storage initialization fails
 */
async function validateTokenStorage(
  tokenStorage: TransportFactoryDependencies['tokenStorage'],
): Promise<void> {
  if (!tokenStorage) {
    return;
  }

  try {
    await tokenStorage.retrieve();
  } catch (error) {
    throw TransportError.serverError(
      `Failed to initialize token storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Creates a transport instance based on configuration with caching and validation.
 *
 * Factory function that creates and caches transport instances for MCP communication.
 * Supports environment variable resolution, legacy config detection, and dependency
 * injection for authentication.
 *
 * Features:
 * - Singleton caching per unique config/dependency combination
 * - Environment variable resolution in config values
 * - Legacy config format detection and normalization
 * - Auth provider and token storage dependency injection
 * - Comprehensive validation before creation
 * @param config - Transport configuration (stdio, sse, websocket, or streamable-http)
 * @param dependencies - Optional auth provider and token storage for authenticated transports
 * @returns Promise resolving to transport instance (cached if previously created)
 * @throws TransportError when config is invalid, auth fails, or transport creation fails
 * @public
 * @see file:./createTransportImplementation.ts - Transport creation logic
 * @see file:./transport-cache.ts - Caching implementation
 * @see file:../validation/validateTransportConfig.ts - Validation logic
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
    await validateAuthProvider(dependencies?.authProvider);
    await validateTokenStorage(dependencies?.tokenStorage);

    // Create appropriate transport based on type
    const transport = await createTransportImplementation(configWithDefaults, dependencies);

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
