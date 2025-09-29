/**
 * RegistryContext singleton for managing MCP registry operations.
 *
 * This singleton provides a centralized interface for interacting with multiple
 * MCP registries, managing temporary servers, and handling configuration persistence.
 *
 * **Architecture:**
 * - Singleton pattern ensures single point of registry management
 * - Aggregates results from multiple registry clients
 * - Provides caching layer for improved performance
 * - Supports both temporary and persistent server configurations
 *
 * **MVP Implementation (Phase 1):**
 * - Uses NoOpCache for caching (no actual caching)
 * - Uses TemporaryServerTracker for temporary server management (tracking only)
 * - Uses ReadOnlyConfigManager for configuration (read-only operations)
 * - Provides full search and server detail functionality
 *
 * **Phase 2 Enhancements:**
 * - Real caching implementation with TTL
 * - Full server lifecycle management
 * - Persistent configuration management
 * - Advanced error recovery and retry logic
 */

import { MCPRegistryClient } from './registry-client.js';
import type {
  IRegistryCache,
  ITemporaryServerManager,
  IConfigManager,
} from './index.js';
import { NoOpCache } from './implementations/cache-noop.js';
import { TemporaryServerTracker } from './implementations/temp-server-tracker.js';
import { ReadOnlyConfigManager } from './implementations/config-readonly.js';
import type {
  RegistryServer,
  RegistrySearchResult,
  RegistryInstallInfo,
} from './types/registry.types.js';
import type { ServerConfig } from './types/config.types.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import {
  extractRegistryUrls,
  aggregateSearchResults,
} from './registry-utils.js';
import {
  generateServerConfigFromRegistry,
  generateInstallInfoFromRegistry,
} from './registry-config-utils.js';
import { filterRegistriesByName } from './utils/registry-filter.js';

/**
 * Options for customizing RegistryContext behavior.
 *
 * These options allow dependency injection for different implementations
 * across development phases and testing scenarios.
 */
export interface RegistryContextOptions {
  /** Custom cache implementation. Defaults to NoOpCache for MVP */
  cache?: IRegistryCache;

  /** Custom temporary server manager. Defaults to TemporaryServerTracker for MVP */
  tempServerManager?: ITemporaryServerManager;

  /** Custom configuration manager. Defaults to ReadOnlyConfigManager for MVP */
  configManager?: IConfigManager;

  /** Path to configuration file. Required for config manager initialization */
  configPath?: string;
}

/**
 * RegistryContext singleton class for centralized MCP registry management.
 *
 * Provides a single point of access for all registry operations including
 * server search, detailed information retrieval, temporary server management,
 * and configuration persistence.
 */
export class RegistryContext {
  /** Singleton instance */
  private static instance: RegistryContext | null = null;

  /** Cache implementation for storing API responses and computed data */
  private readonly cache: IRegistryCache;

  /** Temporary server manager for lifecycle operations */
  private readonly tempServerManager: ITemporaryServerManager;

  /** Configuration manager for persistent storage operations */
  private readonly configManager: IConfigManager;

  /** Map of registry URL to client instances */
  private readonly registryClients: Map<string, MCPRegistryClient>;

  /**
   * Private constructor enforcing singleton pattern.
   *
   * Initializes all dependencies with MVP defaults and creates registry clients
   * for each configured registry URL.
   *
   * @param config - Proxy configuration containing registry URLs and settings
   * @param options - Optional dependency injection for custom implementations
   */
  private constructor(
    private readonly config: ProxyConfig,
    options: RegistryContextOptions = {},
  ) {
    // Initialize dependencies with MVP defaults
    this.cache = options.cache || new NoOpCache();
    this.tempServerManager =
      options.tempServerManager || new TemporaryServerTracker();

    // Configuration manager requires config path for file operations
    const configPath = options.configPath || './.mcp-funnel.json';
    this.configManager =
      options.configManager || new ReadOnlyConfigManager(configPath);

    // Initialize registry clients for each configured registry URL
    this.registryClients = new Map();
    const registryUrls = extractRegistryUrls(config);

    for (const registryUrl of registryUrls) {
      try {
        const client = new MCPRegistryClient(registryUrl, this.cache);
        this.registryClients.set(registryUrl, client);
        console.info(
          `[RegistryContext] Initialized client for registry: ${registryUrl}`,
        );
      } catch (error) {
        console.error(
          `[RegistryContext] Failed to initialize client for ${registryUrl}:`,
          error,
        );
        // Continue with other registries - don't fail entire initialization
      }
    }

    console.info(
      `[RegistryContext] Initialized with ${this.registryClients.size} registry clients`,
    );
  }

  /**
   * Gets the singleton instance, creating it if necessary.
   *
   * **First Call:** Must provide config parameter to initialize the singleton.
   * **Subsequent Calls:** Config parameter is optional and will be ignored.
   *
   * @param config - Proxy configuration (required on first call only)
   * @param options - Optional dependency injection settings
   * @returns The singleton RegistryContext instance
   * @throws Error if config is not provided on first access
   */
  public static getInstance(
    config?: ProxyConfig,
    options?: RegistryContextOptions,
  ): RegistryContext {
    if (!RegistryContext.instance) {
      if (!config) {
        throw new Error(
          'RegistryContext must be initialized with config on first access',
        );
      }
      RegistryContext.instance = new RegistryContext(config, options);
    }
    return RegistryContext.instance;
  }

  /**
   * Resets the singleton instance.
   *
   * Primarily used for testing to ensure clean state between test runs.
   * In production, this should rarely be needed.
   */
  public static reset(): void {
    RegistryContext.instance = null;
  }

  /**
   * Searches for MCP servers across all configured registries.
   *
   * This method aggregates search results from all registry clients, handling
   * errors gracefully to ensure that failures in individual registries don't
   * prevent getting results from others.
   *
   * @param keywords - Search terms to query across registries
   * @param registry - Optional registry filter to search within specific registry
   * @returns Promise resolving to aggregated search results
   */
  public async searchServers(
    keywords: string,
    registry?: string,
  ): Promise<RegistrySearchResult> {
    if (this.registryClients.size === 0) {
      return {
        found: false,
        servers: [],
        message: 'No registries configured',
      };
    }

    console.info(
      `[RegistryContext] Searching ${this.registryClients.size} registries for: ${keywords}`,
    );

    // Filter registries if specific registry requested
    const registriesToSearch = filterRegistriesByName(
      this.registryClients,
      registry,
    );

    if (registriesToSearch.length === 0) {
      return {
        found: false,
        servers: [],
        message: registry
          ? `No registry found matching: ${registry}`
          : 'No registries configured',
      };
    }

    // Search all registries in parallel for better performance
    const searchPromises = registriesToSearch.map(
      async ([registryUrl, client]) => {
        try {
          const results = await client.searchServers(keywords);
          return { registryUrl, results, error: null };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.error(
            `[RegistryContext] Search failed for ${registryUrl}:`,
            errorMessage,
          );
          return { registryUrl, results: [], error: errorMessage };
        }
      },
    );

    const searchResults = await Promise.all(searchPromises);

    return aggregateSearchResults(searchResults);
  }

  /**
   * Retrieves detailed information for a specific server by its registry ID.
   *
   * Tries each configured registry in sequence until the server is found.
   * Returns null if the server is not found in any registry.
   *
   * @param registryId - Unique identifier for the server in the registry
   * @returns Promise resolving to server details or null if not found
   */
  public async getServerDetails(
    registryId: string,
  ): Promise<RegistryServer | null> {
    if (this.registryClients.size === 0) {
      console.warn(
        '[RegistryContext] No registries configured for server details lookup',
      );
      return null;
    }

    console.info(
      `[RegistryContext] Looking up server details for: ${registryId}`,
    );

    // Try each registry until server is found
    for (const [registryUrl, client] of this.registryClients.entries()) {
      try {
        const server = await client.getServer(registryId);
        if (server) {
          console.info(
            `[RegistryContext] Found server ${registryId} in registry: ${registryUrl}`,
          );
          return server;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `[RegistryContext] Failed to get server ${registryId} from ${registryUrl}:`,
          errorMessage,
        );
        // Continue with next registry
      }
    }

    console.info(
      `[RegistryContext] Server ${registryId} not found in any registry`,
    );
    return null;
  }

  /**
   * Enables a temporary MCP server for testing or evaluation.
   *
   * This creates a temporary server configuration that can be used immediately
   * without persisting to the main configuration file.
   *
   * @param server - Server configuration to enable temporarily
   * @returns Promise resolving to unique server identifier
   */
  public async enableTemporary(server: ServerConfig): Promise<string> {
    console.info(`[RegistryContext] Enabling temporary server: ${server.name}`);
    return await this.tempServerManager.spawn(server);
  }

  /**
   * Converts a temporary server to a persistent configuration.
   *
   * This moves a temporary server from the temporary registry to the persistent
   * configuration, making it available across application restarts.
   *
   * @param serverName - Name of the temporary server to make persistent
   * @returns Promise resolving when persistence operation completes
   * @throws Error if server is not found or persistence fails
   */
  public async persistTemporary(serverName: string): Promise<void> {
    console.info(
      `[RegistryContext] Persisting temporary server: ${serverName}`,
    );

    // Get the temporary server configuration
    const serverConfig = this.tempServerManager.getTemporary(serverName);
    if (!serverConfig) {
      throw new Error(`Temporary server '${serverName}' not found`);
    }

    // Add to persistent configuration
    await this.configManager.addServer(serverConfig);

    console.info(
      `[RegistryContext] Successfully persisted server: ${serverName}`,
    );
  }

  /**
   * Checks if any registries are configured and available.
   *
   * @returns True if at least one registry is configured, false otherwise
   */
  public hasRegistries(): boolean {
    return this.registryClients.size > 0;
  }

  /**
   * Generates a server configuration from registry server data.
   *
   * Converts registry server metadata into a standardized ServerConfig that can
   * be used for server spawning or configuration persistence.
   *
   * @param server - Registry server data to convert
   * @returns Server configuration ready for use
   */
  public async generateServerConfig(
    server: RegistryServer,
  ): Promise<ServerConfig> {
    return generateServerConfigFromRegistry(server);
  }

  /**
   * Generates comprehensive installation information for a server.
   *
   * Provides everything needed to install and configure a server, including
   * the configuration snippet and human-readable installation instructions.
   *
   * @param server - Registry server to generate install info for
   * @returns Complete installation information
   */
  public async generateInstallInfo(
    server: RegistryServer,
  ): Promise<RegistryInstallInfo> {
    return generateInstallInfoFromRegistry(server);
  }
}
