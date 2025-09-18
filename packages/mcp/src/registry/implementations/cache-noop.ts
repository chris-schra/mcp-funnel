import type { IRegistryCache } from '../interfaces/cache.interface.js';

/**
 * No-operation cache implementation for MVP registry system.
 *
 * This cache doesn't actually store anything - all operations are no-ops that
 * return safe default values. This allows the registry system to be built and
 * tested without requiring a real cache implementation.
 *
 * Design considerations:
 * - All methods are async to match the interface contract
 * - Generic type parameter T provides type safety for cached values
 * - Returns null/false/void as appropriate for each operation
 * - Zero memory footprint - no internal state
 *
 * In Phase 2, this will be replaced with a real cache implementation
 * (in-memory with TTL, Redis, etc.) without changing the interface.
 *
 * @template T - The type of values stored in the cache
 *
 * @example
 * ```typescript
 * const cache = new NoOpCache<ToolDefinition>();
 * const tool = await cache.get('tool:github__create_issue'); // Always returns null
 * await cache.set('tool:github__create_issue', toolData); // Does nothing
 * const exists = await cache.has('tool:github__create_issue'); // Always returns false
 * ```
 */
export class NoOpCache<T = unknown> implements IRegistryCache<T> {
  /**
   * Retrieves a value from the cache by key.
   *
   * @param _key - The cache key to look up
   * @returns Promise resolving to null (no-op - nothing is ever cached)
   */
  async get(_key: string): Promise<T | null> {
    return null;
  }

  /**
   * Stores a value in the cache with an optional time-to-live.
   *
   * @param _key - The cache key to store under
   * @param _value - The value to cache
   * @param _ttlMs - Optional time-to-live in milliseconds (ignored in no-op)
   * @returns Promise that resolves immediately (no-op - nothing is stored)
   */
  async set(_key: string, _value: T, _ttlMs?: number): Promise<void> {
    // No-op: Accept parameters but don't store anything
  }

  /**
   * Checks if a key exists in the cache and is not expired.
   *
   * @param _key - The cache key to check
   * @returns Promise resolving to false (no-op - nothing is ever cached)
   */
  async has(_key: string): Promise<boolean> {
    return false;
  }

  /**
   * Removes a specific key from the cache.
   *
   * @param _key - The cache key to remove
   * @returns Promise that resolves immediately (no-op - nothing to remove)
   */
  async delete(_key: string): Promise<void> {
    // No-op: Accept parameter but don't remove anything
  }

  /**
   * Clears all entries from the cache.
   *
   * @returns Promise that resolves immediately (no-op - nothing to clear)
   */
  async clear(): Promise<void> {
    // No-op: Nothing to clear
  }
}
