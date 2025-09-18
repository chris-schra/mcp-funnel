/**
 * Secret manager for coordinating multiple secret providers in MCP Funnel.
 *
 * Orchestrates secret resolution across multiple providers, handling errors
 * gracefully and merging results with proper precedence.
 */

import { ISecretProvider, ISecretProviderRegistry } from './types.js';

/**
 * Cache entry for resolved secrets with expiration.
 */
interface CacheEntry {
  secrets: Record<string, string>;
  resolvedAt: Date;
  ttl: number; // TTL in milliseconds
}

/**
 * Options for configuring the SecretManager.
 */
export interface SecretManagerOptions {
  /**
   * Cache TTL in milliseconds. Set to 0 to disable caching.
   * Default: 300000 (5 minutes)
   */
  cacheTtl?: number;
}

/**
 * Manages multiple secret providers and coordinates secret resolution.
 *
 * The SecretManager provides a unified interface for resolving secrets from
 * multiple providers, handling failures gracefully, and merging results with
 * proper precedence (later providers override earlier ones).
 *
 * @example
 * ```typescript
 * const manager = new SecretManager([
 *   new EnvSecretProvider(),
 *   new KeychainSecretProvider()
 * ]);
 *
 * const secrets = await manager.resolveSecrets();
 * console.log(secrets.API_KEY); // Value from the last provider that resolved it
 * ```
 */
export class SecretManager {
  private providers: ISecretProvider[];
  private registry?: ISecretProviderRegistry;
  private cache?: CacheEntry;
  private cacheTtl: number;

  /**
   * Creates a new SecretManager instance.
   *
   * @param providers - Array of secret providers to use for resolution
   * @param registry - Optional registry for additional provider management
   * @param options - Configuration options for the manager
   */
  constructor(
    providers: ISecretProvider[] = [],
    registry?: ISecretProviderRegistry,
    options: SecretManagerOptions = {},
  ) {
    this.providers = [...providers]; // Create a defensive copy
    this.registry = registry;
    this.cacheTtl = options.cacheTtl ?? 300000; // 5 minutes default
  }

  /**
   * Resolves secrets from all registered providers.
   *
   * Calls resolveSecrets() on all providers and merges the results.
   * Later providers in the array override values from earlier providers.
   * Provider errors are logged but do not stop the resolution process.
   *
   * @returns A promise that resolves to the merged secrets from all providers
   */
  async resolveSecrets(): Promise<Record<string, string>> {
    // Check cache first
    if (this.cache && this.isCacheValid()) {
      return { ...this.cache.secrets }; // Return defensive copy
    }

    const allSecrets: Record<string, string> = {};
    const allProviders = this.getAllProviders();

    // Resolve secrets from each provider
    for (const provider of allProviders) {
      try {
        const providerSecrets = await provider.resolveSecrets();

        // Merge with later providers overriding earlier ones
        Object.assign(allSecrets, providerSecrets);
      } catch (error) {
        // Log error but continue with other providers
        const providerName = provider.getName();
        console.error(
          `Failed to resolve secrets from provider '${providerName}':`,
          error,
        );
      }
    }

    // Update cache if caching is enabled
    if (this.cacheTtl > 0) {
      this.cache = {
        secrets: { ...allSecrets }, // Store defensive copy
        resolvedAt: new Date(),
        ttl: this.cacheTtl,
      };
    }

    return allSecrets;
  }

  /**
   * Adds a new provider to the manager.
   *
   * The provider will be added to the end of the provider list,
   * giving it the highest precedence for secret resolution.
   *
   * @param provider - The secret provider to add
   */
  addProvider(provider: ISecretProvider): void {
    this.providers.push(provider);
    this.invalidateCache();
  }

  /**
   * Removes the first provider from the manager by name.
   *
   * @param name - The name of the provider to remove (from getName())
   * @returns true if a provider was removed, false if no provider with that name was found
   */
  removeProvider(name: string): boolean {
    const index = this.providers.findIndex(
      (provider) => provider.getName() === name,
    );

    if (index === -1) {
      return false;
    }

    this.providers.splice(index, 1);
    this.invalidateCache();
    return true;
  }

  /**
   * Gets all providers managed by this instance.
   *
   * @returns A defensive copy of all providers (direct + registry)
   */
  private getAllProviders(): ISecretProvider[] {
    const registryProviders = this.registry
      ? Array.from(this.registry.getAll().values())
      : [];

    return [...this.providers, ...registryProviders];
  }

  /**
   * Checks if the current cache entry is still valid.
   *
   * @returns true if cache exists and hasn't expired, false otherwise
   */
  private isCacheValid(): boolean {
    if (!this.cache || this.cacheTtl <= 0) {
      return false;
    }

    const now = Date.now();
    const cacheAge = now - this.cache.resolvedAt.getTime();
    return cacheAge < this.cache.ttl;
  }

  /**
   * Invalidates the current cache.
   */
  private invalidateCache(): void {
    this.cache = undefined;
  }

  /**
   * Gets the current cache status for debugging.
   *
   * @returns Cache information or null if no cache exists
   */
  getCacheInfo(): { valid: boolean; age: number; ttl: number } | null {
    if (!this.cache) {
      return null;
    }

    const age = Date.now() - this.cache.resolvedAt.getTime();
    return {
      valid: this.isCacheValid(),
      age,
      ttl: this.cache.ttl,
    };
  }

  /**
   * Clears the cache manually.
   */
  clearCache(): void {
    this.invalidateCache();
  }

  /**
   * Gets the list of provider names currently managed.
   *
   * @returns Array of provider names
   */
  getProviderNames(): string[] {
    return this.getAllProviders().map((provider) => provider.getName());
  }
}
