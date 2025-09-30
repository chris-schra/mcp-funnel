/**
 * Configuration types for the MCP registry system.
 *
 * This module defines the configuration structures used by the registry to manage
 * MCP server configurations, including extensions for registry-specific metadata
 * and internal caching mechanisms.
 * @internal
 */

// Import ServerConfig for both re-export and extension
import { ServerConfig } from '../interfaces/temp-server.interface.js';

// Re-export ServerConfig from the interface file for consistency
export type { ServerConfig };

/**
 * Registry-specific configuration entry that extends the base ServerConfig
 * with additional metadata from the registry source.
 *
 * This type is used when storing server configurations that have been fetched
 * from a registry, allowing us to preserve the original registry data alongside
 * the normalized server configuration.
 * @internal
 */
export interface RegistryConfigEntry extends Omit<ServerConfig, 'headers'> {
  /**
   * Optional metadata from the original registry source.
   * This can include registry-specific fields like download counts,
   * ratings, categories, or other metadata that may be useful
   * for displaying or filtering registry entries.
   */
  _registry_metadata?: Record<string, unknown>; // Store original registry data

  /**
   * Raw metadata for cases where the server configuration cannot be normalized.
   * Used as a fallback when registry types are unknown or configuration fails.
   */
  _raw_metadata?: Record<string, unknown>;

  /**
   * HTTP headers for remote server authentication and configuration.
   * Can be either a Record (final format) or KeyValueInput[] (registry format).
   */
  headers?:
    | Record<string, string>
    | import('./registry.types.js').KeyValueInput[];
}

/**
 * Generic cache entry type for internal caching mechanisms.
 *
 * Used by the registry system to cache API responses, parsed configurations,
 * and other time-sensitive data with TTL (time-to-live) functionality.
 * @typeParam T - The type of the cached value
 * @internal
 */
export interface CacheEntry<T = unknown> {
  /** The cached value of type T */
  value: T;
  /** Timestamp (in milliseconds) when this cache entry expires */
  expiresAt: number;
}
