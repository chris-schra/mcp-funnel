/**
 * Transport instance cache management for singleton behavior.
 * Provides instance tracking and cache key generation for transport reuse.
 */

import type { TransportConfig } from '../../types/transport.types.js';
import type { IAuthProvider } from '../../auth/interfaces/auth-provider.interface.js';
import type { ITokenStorage } from '../../auth/interfaces/token-storage.interface.js';
import type { FactoryTransport } from './transport-wrapper.js';

/**
 * Dependencies that can be injected into transports
 */
export interface TransportFactoryDependencies {
  authProvider?: IAuthProvider;
  tokenStorage?: ITokenStorage;
}

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
 * Generates a cache key for transport singleton behavior.
 * Uses unique instance IDs to ensure different provider/storage instances
 * don't share cached transports even with identical configurations.
 */
export function generateCacheKey(
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
 * Gets a cached transport instance if it exists
 */
export function getCachedTransport(
  cacheKey: string,
): FactoryTransport | undefined {
  return transportCache.get(cacheKey);
}

/**
 * Stores a transport instance in the cache
 */
export function setCachedTransport(
  cacheKey: string,
  transport: FactoryTransport,
): void {
  transportCache.set(cacheKey, transport);
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
