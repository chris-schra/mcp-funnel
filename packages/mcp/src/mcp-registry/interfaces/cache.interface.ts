/**
 * Generic cache interface for MCP registry data storage and retrieval.
 *
 * Designed to support multiple cache implementations across development phases.
 *
 * **Implementation Strategy:**
 * - MVP: No-op cache for immediate development
 * - Phase 2: In-memory cache with TTL support
 * - Future: Redis, file-based, or other persistent cache backends
 *
 * The generic type parameter allows for type-safe caching of specific data structures
 * while maintaining flexibility for different value types.
 * @typeParam T - The type of values stored in the cache
 * @public
 */
export interface IRegistryCache<T = unknown> {
  /**
   * Retrieves a value from the cache by key.
   * @param key - The cache key to look up
   * @returns Promise resolving to the cached value, or null if not found or expired
   * @example
   * ```typescript
   * const toolData = await cache.get<ToolDefinition>('tool:github__create_issue');
   * if (toolData) {
   *   // Use cached data
   * }
   * ```
   */
  get(key: string): Promise<T | null>;

  /**
   * Stores a value in the cache with an optional time-to-live.
   * @param key - The cache key to store under
   * @param value - The value to cache
   * @param ttlMs - Optional time-to-live in milliseconds. If not provided,
   *                implementation may use a default TTL or store indefinitely
   * @returns Promise that resolves when the value has been stored
   * @example
   * ```typescript
   * // Cache for 5 minutes
   * await cache.set('registry:tools', toolList, 5 * 60 * 1000);
   *
   * // Cache with default TTL
   * await cache.set('user:preferences', userPrefs);
   * ```
   */
  set(key: string, value: T, ttlMs?: number): Promise<void>;

  /**
   * Checks if a key exists in the cache and is not expired.
   * @param key - The cache key to check
   * @returns Promise resolving to true if the key exists and is valid, false otherwise
   * @example
   * ```typescript
   * if (await cache.has('expensive:computation')) {
   *   const result = await cache.get('expensive:computation');
   * } else {
   *   const result = await performExpensiveComputation();
   *   await cache.set('expensive:computation', result);
   * }
   * ```
   */
  has(key: string): Promise<boolean>;

  /**
   * Removes a specific key from the cache.
   * @param key - The cache key to remove
   * @returns Promise that resolves when the key has been removed
   * @example
   * ```typescript
   * // Invalidate cache when data changes
   * await cache.delete('registry:tools');
   * ```
   */
  delete(key: string): Promise<void>;

  /**
   * Clears all entries from the cache.
   * @returns Promise that resolves when the cache has been cleared
   * @example
   * ```typescript
   * // Clear cache during configuration reload
   * await cache.clear();
   * ```
   */
  clear(): Promise<void>;
}

/**
 * Type alias for registry tool cache to provide semantic meaning.
 *
 * Provides type safety for common registry caching patterns.
 * In Phase 2, this could be expanded to a full interface with
 * tool-specific methods like getToolsByServer, invalidateServerCache, etc.
 * @public
 */
export type IRegistryToolCache = IRegistryCache<unknown>;

/**
 * Cache key patterns for consistent key naming across the registry system.
 *
 * Using these constants helps prevent typos and ensures consistent cache
 * key naming patterns across different parts of the system.
 * @example
 * ```typescript
 * const key = CacheKeys.TOOLS.SINGLE('github', 'create_issue');
 * // Returns: 'tool:github__create_issue'
 * ```
 * @public
 */
export const CacheKeys = {
  /**
   * Cache key patterns for tool-related data.
   */
  TOOLS: {
    /**
     * Pattern: `tool:${serverName}__${toolName}`
     *
     * @param serverName - Server name
     * @param toolName - Tool name
     * @returns Cache key in format `tool:${serverName}__${toolName}`
     */
    SINGLE: (serverName: string, toolName: string) =>
      `tool:${serverName}__${toolName}`,
    /**
     * Pattern: `tools:server:${serverName}`
     * @param serverName - Server name
     * @returns Cache key in format `tools:server:${serverName}`
     */
    BY_SERVER: (serverName: string) => `tools:server:${serverName}`,
    /** Pattern: `tools:all` */
    ALL: 'tools:all',
  },

  /**
   * Cache key patterns for registry metadata.
   */
  REGISTRY: {
    /** Pattern: `registry:servers` */
    SERVERS: 'registry:servers',
    /** Pattern: `registry:stats` */
    STATS: 'registry:stats',
    /**
     * Pattern: `registry:config:${configHash}`
     * @param configHash - Configuration hash
     * @returns Cache key in format `registry:config:${configHash}`
     */
    CONFIG: (configHash: string) => `registry:config:${configHash}`,
  },
} as const;
