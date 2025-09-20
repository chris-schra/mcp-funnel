/**
 * MCP Registry Client for interacting with the Model Context Protocol registry API.
 *
 * This client provides a high-level interface for searching and retrieving MCP server
 * information from the registry, with built-in caching support for improved performance.
 *
 * Key features:
 * - Server search with keyword-based queries
 * - Individual server detail retrieval
 * - Configurable caching layer with TTL support
 * - Comprehensive error handling
 * - Type-safe API with full TypeScript support
 *
 * @example
 * ```typescript
 * import { MCPRegistryClient } from './registry-client.js';
 * import { NoOpCache } from './implementations/cache-noop.js';
 *
 * // Create client with default no-op cache
 * const client = new MCPRegistryClient('https://registry.modelcontextprotocol.io');
 *
 * // Search for servers
 * const servers = await client.searchServers('github');
 * console.log(`Found ${servers.length} GitHub-related servers`);
 *
 * // Get detailed server information
 * const server = await client.getServer('github-mcp-server');
 * if (server) {
 *   console.log(`Server: ${server.name} - ${server.description}`);
 * }
 * ```
 */

import type { ServerDetail, RegistryServer } from './types/registry.types.js';
import type { IRegistryCache } from './interfaces/cache.interface.js';
import { NoOpCache } from './implementations/cache-noop.js';

/**
 * HTTP response interface for registry API responses.
 * Provides a consistent way to handle both successful and error responses.
 */
interface RegistryResponse<T> {
  /** Whether the HTTP request was successful */
  ok: boolean;
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Parse response body as JSON */
  json(): Promise<T>;
}

/**
 * Search response structure from the real MCP registry API.
 * The API returns a standardized structure with servers array and metadata.
 */
interface SearchResponse {
  /** Array of servers matching the search criteria */
  servers: ServerDetail[];
  /** Pagination and result metadata */
  metadata: {
    /** Total number of servers found */
    count: number;
    /** Cursor for next page of results (null if no more pages) */
    next_cursor: string | null;
  };
}

/**
 * MCPRegistryClient provides a high-level interface for interacting with the
 * Model Context Protocol registry API.
 *
 * This client handles all the complexity of API communication, caching, and
 * error handling, providing a clean TypeScript interface for registry operations.
 *
 * Architecture decisions:
 * - Uses dependency injection for cache to support different implementations
 * - Implements comprehensive error handling with logging
 * - Provides type-safe responses with proper null handling
 * - Uses consistent cache key patterns for predictable behavior
 * - Supports configurable TTL for cache entries
 *
 * @example
 * ```typescript
 * // Basic usage with default cache
 * const client = new MCPRegistryClient('https://registry.modelcontextprotocol.io');
 *
 * // With custom cache implementation
 * const cache = new InMemoryCache();
 * const clientWithCache = new MCPRegistryClient('https://registry.modelcontextprotocol.io', cache);
 * ```
 */
export class MCPRegistryClient {
  /** Cache instance for storing API responses */
  private readonly cache: IRegistryCache<unknown>;

  /** Default TTL for cache entries (1 hour in milliseconds) */
  private static readonly DEFAULT_CACHE_TTL = 3600000;

  /**
   * Creates a new MCPRegistryClient instance.
   *
   * @param baseUrl - The base URL of the MCP registry API (e.g., 'https://registry.modelcontextprotocol.io')
   * @param cache - Optional cache implementation. Defaults to NoOpCache if not provided
   *
   * @example
   * ```typescript
   * // With default no-op cache
   * const client = new MCPRegistryClient('https://registry.modelcontextprotocol.io');
   *
   * // With custom cache
   * const cache = new InMemoryCache();
   * const client = new MCPRegistryClient('https://registry.modelcontextprotocol.io', cache);
   * ```
   */
  constructor(
    private readonly baseUrl: string,
    cache?: IRegistryCache<unknown>,
  ) {
    this.cache = cache || new NoOpCache();
  }

  /**
   * Searches for MCP servers in the registry based on keywords.
   *
   * This method performs a keyword-based search across server names, descriptions,
   * and other metadata. Results are cached to improve performance for repeated queries.
   *
   * Cache behavior:
   * - Cache key format: `${baseUrl}:search:${keywords}`
   * - TTL: 1 hour (3600000ms)
   * - Cache hits return immediately without API calls
   * - Cache misses trigger API requests and store results
   *
   * Error handling:
   * - Network errors: Logged and re-thrown as Error
   * - HTTP errors: Logged and re-thrown with status information
   * - JSON parsing errors: Logged and re-thrown
   * - Malformed responses: Return empty array
   *
   * @param keywords - Search terms to query for (spaces and special characters are URL-encoded)
   * @returns Promise resolving to array of matching servers (empty array if none found)
   *
   * @throws {Error} Network errors, HTTP errors, or JSON parsing failures
   *
   * @example
   * ```typescript
   * // Search for GitHub-related servers
   * const servers = await client.searchServers('github');
   * console.log(`Found ${servers.length} servers`);
   *
   * // Search with multiple keywords
   * const codeServers = await client.searchServers('code analysis typescript');
   * ```
   */
  async searchServers(keywords: string): Promise<ServerDetail[]> {
    const cacheKey = `${this.baseUrl}:search:${keywords}`;

    try {
      // Check cache first
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        console.info(`[MCPRegistryClient] Cache hit for search: ${keywords}`);
        return cached as ServerDetail[];
      }

      console.info(
        `[MCPRegistryClient] Cache miss, fetching search results for: ${keywords}`,
      );

      // Fetch from registry API using the real endpoint structure
      // Real API: GET /v0/servers?search={keywords}
      const url = `${this.baseUrl}/v0/servers?search=${encodeURIComponent(keywords)}`;
      const response = (await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      })) as RegistryResponse<SearchResponse>;

      if (!response.ok) {
        const error = new Error(
          `Registry search failed: ${response.status} ${response.statusText}`,
        );
        console.error(`[MCPRegistryClient] Search API error:`, error.message);
        throw error;
      }

      const data = await response.json();

      // Real API returns { servers: [], metadata: { count, next_cursor } }
      const servers = data.servers || [];

      // Log pagination info for debugging
      if (data.metadata) {
        console.info(
          `[MCPRegistryClient] Found ${data.metadata.count} total servers, returning ${servers.length} in this page`,
        );
        if (data.metadata.next_cursor) {
          console.info(
            `[MCPRegistryClient] More results available (next_cursor: ${data.metadata.next_cursor})`,
          );
        }
      }

      // Ensure we return a valid array
      const validServers = Array.isArray(servers) ? servers : [];

      // Store in cache with TTL
      await this.cache.set(
        cacheKey,
        validServers,
        MCPRegistryClient.DEFAULT_CACHE_TTL,
      );

      console.info(
        `[MCPRegistryClient] Search completed: ${validServers.length} servers found`,
      );
      return validServers;
    } catch (error) {
      console.error(`[MCPRegistryClient] Error searching servers:`, error);
      throw error instanceof Error ? error : new Error('Unknown search error');
    }
  }

  /**
   * Retrieves detailed information for a specific MCP server by its name or ID.
   *
   * This method intelligently chooses the appropriate API endpoint based on the identifier:
   * - For UUIDs: Uses direct GET /v0/servers/{id} endpoint for fast retrieval
   * - For names: Performs search and exact name matching
   *
   * Cache behavior:
   * - Cache key format: `${baseUrl}:server:${id}`
   * - TTL: 1 hour (3600000ms)
   * - Cache hits return immediately without API calls
   * - Cache misses trigger appropriate API requests and store results
   *
   * Error handling:
   * - No exact match found: Return null (server not found)
   * - HTTP errors: Logged and re-thrown
   * - Network errors: Logged and re-thrown
   * - JSON parsing errors: Logged and re-thrown
   *
   * @param identifier - The name or UUID of the server to retrieve
   * @returns Promise resolving to server details or null if not found
   *
   * @throws {Error} Network errors, HTTP errors, or JSON parsing failures
   *
   * @example
   * ```typescript
   * // Get server details by name
   * const server = await client.getServer('github-mcp-server');
   * if (server) {
   *   console.log(`Server: ${server.name}`);
   *   console.log(`Description: ${server.description}`);
   *   console.log(`Tools: ${server.tools?.join(', ') || 'None listed'}`);
   * } else {
   *   console.log('Server not found');
   * }
   *
   * // Get server details by UUID
   * const serverById = await client.getServer('550e8400-e29b-41d4-a716-446655440000');
   * ```
   */
  async getServer(identifier: string): Promise<RegistryServer | null> {
    const cacheKey = `${this.baseUrl}:server:${identifier}`;

    try {
      // Check cache first
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        console.info(`[MCPRegistryClient] Cache hit for server: ${identifier}`);
        return cached as RegistryServer;
      }

      console.info(
        `[MCPRegistryClient] Cache miss, fetching server: ${identifier}`,
      );

      // Check if identifier is a UUID (case-insensitive)
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          identifier,
        );

      let server: RegistryServer | null = null;

      if (isUuid) {
        // Direct GET endpoint for UUIDs
        console.info(
          `[MCPRegistryClient] Using direct API endpoint for UUID: ${identifier}`,
        );
        const response = (await fetch(
          `${this.baseUrl}/v0/servers/${identifier}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
        )) as RegistryResponse<RegistryServer>;

        if (response.ok) {
          server = await response.json();
        } else if (response.status === 404) {
          console.info(`[MCPRegistryClient] Server not found: ${identifier}`);
          return null;
        } else {
          const error = new Error(
            `Registry server fetch failed: ${response.status} ${response.statusText}`,
          );
          console.error(`[MCPRegistryClient] Direct API error:`, error.message);
          throw error;
        }
      } else {
        // Search by name for non-UUIDs
        console.info(`[MCPRegistryClient] Searching by name: ${identifier}`);
        const searchResults = await this.searchServers(identifier);

        // Look for exact name match (case-insensitive)
        server =
          searchResults.find(
            (s) => s.name.toLowerCase() === identifier.toLowerCase(),
          ) || null;
      }

      if (!server) {
        console.info(`[MCPRegistryClient] Server not found: ${identifier}`);
        return null;
      }

      // Store in cache with TTL
      await this.cache.set(
        cacheKey,
        server,
        MCPRegistryClient.DEFAULT_CACHE_TTL,
      );

      console.info(
        `[MCPRegistryClient] Server details retrieved for: ${identifier} (matched: ${server.name})`,
      );
      return server;
    } catch (error) {
      console.error(
        `[MCPRegistryClient] Error getting server ${identifier}:`,
        error,
      );
      throw error instanceof Error
        ? error
        : new Error('Unknown server fetch error');
    }
  }
}
