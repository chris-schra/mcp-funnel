/**
 * MCP Registry Client for interacting with the Model Context Protocol registry API.
 *
 * Provides a high-level interface for searching and retrieving MCP server
 * information from the registry, with built-in caching support for improved performance.
 *
 * **Key features:**
 * - Server search with keyword-based queries
 * - Individual server detail retrieval
 * - Configurable caching layer with TTL support
 * - Comprehensive error handling
 * - Type-safe API with full TypeScript support
 * @example
 * ```typescript
 * import { MCPRegistryClient } from './registry-client.js';
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
 * @public
 */

import type { ServerDetail, RegistryServer } from './types/registry.types.js';
import type { IRegistryCache } from './interfaces/cache.interface.js';
import { NoOpCache } from './implementations/cache-noop.js';
import { classifyAndLogError } from './utils/error-classifier.js';
import {
  isUuid,
  fetchServerByUuid,
  findServerByName,
} from './utils/server-fetch.js';

/**
 * HTTP response interface for registry API responses.
 *
 * Provides a consistent way to handle both successful and error responses.
 * @internal
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
 *
 * The API returns a standardized structure with servers array and metadata.
 * @internal
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
 * Handles all the complexity of API communication, caching, and error handling,
 * providing a clean TypeScript interface for registry operations.
 *
 * **Architecture decisions:**
 * - Uses dependency injection for cache to support different implementations
 * - Implements comprehensive error handling with logging
 * - Provides type-safe responses with proper null handling
 * - Uses consistent cache key patterns for predictable behavior
 * - Supports configurable TTL for cache entries
 *
 * **Error handling strategy:**
 * - Throws errors for infrastructure failures (network, parsing, server errors)
 * - Returns empty arrays/null only for legitimate "not found" cases
 * - Logs different error types with specific context for debugging
 * - Allows calling layers to provide meaningful error messages to users
 * @example
 * ```typescript
 * // Basic usage with default cache
 * const client = new MCPRegistryClient('https://registry.modelcontextprotocol.io');
 *
 * // With custom cache implementation
 * const cache = new InMemoryCache();
 * const clientWithCache = new MCPRegistryClient('https://registry.modelcontextprotocol.io', cache);
 * ```
 * @public
 */
export class MCPRegistryClient {
  /** Cache instance for storing API responses */
  private readonly cache: IRegistryCache<unknown>;

  /** Tracks in-flight server detail fetches to deduplicate concurrent requests */
  private readonly inflightServerRequests = new Map<
    string,
    Promise<RegistryServer | null>
  >();

  /** Default TTL for cache entries (1 hour in milliseconds) */
  private static readonly DEFAULT_CACHE_TTL = 3600000;

  /**
   * Creates a new MCPRegistryClient instance.
   * @param {string} baseUrl - The base URL of the MCP registry API (e.g., 'https://registry.modelcontextprotocol.io')
   * @param {IRegistryCache<unknown>} [cache] - Optional cache implementation. Defaults to NoOpCache if not provided
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
  public constructor(
    private readonly baseUrl: string,
    cache?: IRegistryCache<unknown>,
  ) {
    this.cache = cache || new NoOpCache();
  }

  /**
   * Searches for MCP servers in the registry based on keywords.
   *
   * Performs a keyword-based search across server names, descriptions, and other
   * metadata. Results are cached to improve performance for repeated queries.
   *
   * **Cache behavior:**
   * - Cache key format: `${baseUrl}:search:${keywords}`
   * - TTL: 1 hour (3600000ms)
   * - Cache hits return immediately without API calls
   * - Cache misses trigger API requests and store results
   *
   * **Error handling:**
   * - Network errors: Logged and thrown
   * - HTTP errors: Logged and thrown
   * - JSON parsing errors: Logged and thrown
   * - Successfully returns empty array only when no servers match
   * @param {string} keywords - Search terms to query for (spaces and special characters are URL-encoded)
   * @returns {Promise<ServerDetail[]>} Promise resolving to array of matching servers (empty array if none found)
   * @throws {Error} if network, parsing, or server errors occur
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
  public async searchServers(keywords: string): Promise<ServerDetail[]> {
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
        // Log HTTP error with consistent format
        console.error(
          `[MCPRegistryClient] HTTP error during search for ${keywords}: ${response.status} ${response.statusText}`,
        );
        throw new Error(
          `Registry search failed: ${response.status} ${response.statusText}`,
        );
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
      // Log the error for debugging
      classifyAndLogError(error, 'search', keywords);
      // Re-throw the error so calling layer can handle it appropriately
      // This allows registry-context to provide meaningful error messages
      throw error;
    }
  }

  /**
   * Retrieves detailed information for a specific MCP server by its name or ID.
   *
   * Intelligently chooses the appropriate API endpoint based on the identifier:
   * - For UUIDs: Uses direct GET /v0/servers/{id} endpoint for fast retrieval
   * - For names: Performs search and exact name matching
   *
   * **Cache behavior:**
   * - Cache key format: `${baseUrl}:server:${id}`
   * - TTL: 1 hour (3600000ms)
   * - Cache hits return immediately without API calls
   * - Cache misses trigger appropriate API requests and store results
   *
   * **Error handling:**
   * - No exact match found: Return null (server not found)
   * - Network errors: Logged and thrown
   * - HTTP errors: Logged and thrown (except 404 which returns null)
   * - JSON parsing errors: Logged and thrown
   * @param {string} identifier - The name or UUID of the server to retrieve
   * @returns {Promise<RegistryServer | null>} Promise resolving to server details or null if not found
   * @throws {Error} if network, parsing, or server errors occur
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
  public async getServer(identifier: string): Promise<RegistryServer | null> {
    const cacheKey = `${this.baseUrl}:server:${identifier}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.info(`[MCPRegistryClient] Cache hit for server: ${identifier}`);
      return cached as RegistryServer;
    }

    const existingRequest = this.inflightServerRequests.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }

    const inflightPromise = this.fetchServerDetails(identifier);
    this.inflightServerRequests.set(cacheKey, inflightPromise);

    try {
      const server = await inflightPromise;

      if (server) {
        await this.cache.set(
          cacheKey,
          server,
          MCPRegistryClient.DEFAULT_CACHE_TTL,
        );
      }

      return server;
    } catch (error) {
      // Log the error for debugging
      classifyAndLogError(error, 'server fetch', identifier);
      // Re-throw the error so calling layer can handle it appropriately
      // This allows registry-context to provide meaningful error messages
      throw error;
    } finally {
      this.inflightServerRequests.delete(cacheKey);
    }
  }

  /**
   * Internal method to fetch server details from the API.
   * @param {string} identifier - Server name or UUID
   * @returns {Promise<RegistryServer | null>} Promise resolving to server details or null
   * @internal
   */
  private async fetchServerDetails(
    identifier: string,
  ): Promise<RegistryServer | null> {
    console.info(
      `[MCPRegistryClient] Cache miss, fetching server: ${identifier}`,
    );

    // Try direct UUID fetch first
    if (isUuid(identifier)) {
      return await fetchServerByUuid(this.baseUrl, identifier);
    }

    // Fall back to name search
    console.info(`[MCPRegistryClient] Searching by name: ${identifier}`);
    const searchResults = await this.searchServers(identifier);
    const server = findServerByName(searchResults, identifier);

    if (!server) {
      console.info(`[MCPRegistryClient] Server not found: ${identifier}`);
      return null;
    }

    console.info(
      `[MCPRegistryClient] Server details retrieved for: ${identifier} (matched: ${server.name})`,
    );
    return server;
  }
}
