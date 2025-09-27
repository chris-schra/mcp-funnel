/**
 * Mock cache implementations for testing registry client functionality.
 *
 * This file provides different cache implementations used in tests:
 * - MockCache: Full-featured cache with TTL support
 * - NoOpCache: Cache that never stores or retrieves data
 *
 * These implementations allow testing of cache behavior without external dependencies.
 */

import type { IRegistryCache } from '../interfaces/cache.interface.js';

/**
 * Mock cache implementation for testing cache behavior.
 * Provides full cache functionality with TTL support for comprehensive testing.
 */
export class MockCache implements IRegistryCache<unknown> {
  private readonly storage = new Map<
    string,
    { value: unknown; expires?: number }
  >();

  /**
   * Retrieves a value from the cache, respecting TTL expiration.
   */
  async get(key: string): Promise<unknown | null> {
    const item = this.storage.get(key);
    if (!item) return null;

    if (item.expires && Date.now() > item.expires) {
      this.storage.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Stores a value in the cache with optional TTL.
   */
  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const expires = ttlMs ? Date.now() + ttlMs : undefined;
    this.storage.set(key, { value, expires });
  }

  /**
   * Checks if a key exists and is not expired.
   */
  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  /**
   * Removes a specific key from the cache.
   */
  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  /**
   * Clears all entries from the cache.
   */
  async clear(): Promise<void> {
    this.storage.clear();
  }

  /**
   * Gets the number of items currently in the cache (for testing).
   */
  get size(): number {
    return this.storage.size;
  }

  /**
   * Gets all cache keys (for testing/debugging).
   */
  get keys(): string[] {
    return Array.from(this.storage.keys());
  }
}

/**
 * No-op cache implementation that never stores or retrieves data.
 * Used for testing scenarios where caching should be disabled.
 */
export class NoOpCache implements IRegistryCache<unknown> {
  /**
   * Always returns null (cache miss).
   */
  async get(): Promise<null> {
    return null;
  }

  /**
   * No-op set operation.
   */
  async set(): Promise<void> {
    // Intentionally empty - no-op
  }

  /**
   * Always returns false (key never exists).
   */
  async has(): Promise<boolean> {
    return false;
  }

  /**
   * No-op delete operation.
   */
  async delete(): Promise<void> {
    // Intentionally empty - no-op
  }

  /**
   * No-op clear operation.
   */
  async clear(): Promise<void> {
    // Intentionally empty - no-op
  }
}

/**
 * Cache factory for creating appropriate cache instances in tests.
 */
export class CacheFactory {
  /**
   * Creates a mock cache with full functionality.
   */
  static createMockCache(): MockCache {
    return new MockCache();
  }

  /**
   * Creates a no-op cache for cache-disabled scenarios.
   */
  static createNoOpCache(): NoOpCache {
    return new NoOpCache();
  }

  /**
   * Creates a cache with specific TTL for testing TTL behavior.
   */
  static createMockCacheWithTTL(defaultTtl: number): MockCache {
    const cache = new MockCache();
    // Override set method to use default TTL if none provided
    const originalSet = cache.set.bind(cache);
    cache.set = async (key: string, value: unknown, ttlMs?: number) => {
      return originalSet(key, value, ttlMs ?? defaultTtl);
    };
    return cache;
  }
}
