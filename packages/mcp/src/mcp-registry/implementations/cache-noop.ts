import type { IRegistryCache } from '../interfaces/cache.interface.js';

/**
 * No-operation cache implementation for MVP registry system.
 *
 * This cache doesn't actually store anything - all operations are no-ops that
 * return safe default values. This allows the registry system to be built and
 * tested without requiring a real cache implementation.
 *
 * **Design considerations:**
 * - All methods are async to match the interface contract
 * - Generic type parameter T provides type safety for cached values
 * - Returns null/false/void as appropriate for each operation
 * - Zero memory footprint - no internal state
 *
 * **Phase 2**: This will be replaced with a real cache implementation
 * (in-memory with TTL, Redis, etc.) without changing the interface.
 * @template T - The type of values stored in the cache
 * @example
 * ```typescript
 * const cache = new NoOpCache<ToolDefinition>();
 * const tool = await cache.get('tool:github__create_issue'); // Always returns null
 * await cache.set('tool:github__create_issue', toolData); // Does nothing
 * const exists = await cache.has('tool:github__create_issue'); // Always returns false
 * ```
 * @public
 */
export class NoOpCache<T = unknown> implements IRegistryCache<T> {
  /**
   * Always returns null (no-op implementation).
   * @inheritDoc
   */
  public async get(_key: string): Promise<T | null> {
    return null;
  }

  /**
   * Does nothing (no-op implementation).
   * @inheritDoc
   */
  public async set(_key: string, _value: T, _ttlMs?: number): Promise<void> {
    // No-op: Accept parameters but don't store anything
  }

  /**
   * Always returns false (no-op implementation).
   * @inheritDoc
   */
  public async has(_key: string): Promise<boolean> {
    return false;
  }

  /**
   * Does nothing (no-op implementation).
   * @inheritDoc
   */
  public async delete(_key: string): Promise<void> {
    // No-op: Accept parameter but don't remove anything
  }

  /**
   * Does nothing (no-op implementation).
   * @inheritDoc
   */
  public async clear(): Promise<void> {
    // No-op: Nothing to clear
  }
}
