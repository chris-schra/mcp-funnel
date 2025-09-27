/**
 * RegistryContext singleton for managing MCP registry operations.
 * Provides centralized interface for registries, temporary servers, and config persistence.
 * MVP: NoOpCache, TemporaryServerTracker, ReadOnlyConfigManager
 */

import type { ProxyConfig } from '../config.js';
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
  KeyValueInput,
} from './types/registry.types.js';
import type { ServerConfig } from './types/config.types.js';
import {
  generateConfigSnippet,
  generateInstallInstructions,
} from './config-generator.js';

/** Options for customizing RegistryContext behavior. */
export interface RegistryContextOptions {
  cache?: IRegistryCache;
  tempServerManager?: ITemporaryServerManager;
  configManager?: IConfigManager;
  configPath?: string;
}

/** RegistryContext singleton class for centralized MCP registry management. */
export class RegistryContext {
  private static instance: RegistryContext | null = null;
  private static readonly REGISTRY_ID_MAPPING: Record<string, string> = {
    official: 'https://registry.modelcontextprotocol.io',
  };

  private readonly cache: IRegistryCache;
  private readonly tempServerManager: ITemporaryServerManager;
  private readonly configManager: IConfigManager;
  private readonly registryClients: Map<string, MCPRegistryClient>;

  /** Private constructor enforcing singleton pattern. */
  private constructor(
    private readonly config: ProxyConfig,
    options: RegistryContextOptions = {},
  ) {
    this.cache = options.cache || new NoOpCache();
    this.tempServerManager =
      options.tempServerManager || new TemporaryServerTracker();
    this.configManager =
      options.configManager ||
      new ReadOnlyConfigManager(options.configPath || './.mcp-funnel.json');
    this.registryClients = new Map();
    const registryUrls = this.extractRegistryUrls(config);

    for (const registryUrl of registryUrls) {
      try {
        this.registryClients.set(
          registryUrl,
          new MCPRegistryClient(registryUrl, this.cache),
        );
      } catch (error) {
        console.error(
          `[RegistryContext] Failed to initialize client for ${registryUrl}:`,
          error,
        );
      }
    }
  }

  /** Gets the singleton instance, creating it if necessary. First call must provide config. */
  static getInstance(
    config?: ProxyConfig,
    options?: RegistryContextOptions,
  ): RegistryContext {
    if (!RegistryContext.instance) {
      if (!config)
        throw new Error(
          'RegistryContext must be initialized with config on first access',
        );
      RegistryContext.instance = new RegistryContext(config, options);
    }
    return RegistryContext.instance;
  }

  /** Resets the singleton instance. Primarily used for testing. */
  static reset(): void {
    RegistryContext.instance = null;
  }

  /** Searches for MCP servers across all configured registries. */
  async searchServers(
    keywords: string,
    registry?: string,
  ): Promise<RegistrySearchResult> {
    if (this.registryClients.size === 0) {
      return { found: false, servers: [], message: 'No registries configured' };
    }

    const allResults: NonNullable<RegistrySearchResult['servers']> = [];
    const errors: string[] = [];

    // Filter registries if specific registry requested
    let registriesToSearch = Array.from(this.registryClients.entries());
    if (registry) {
      const registryUrl =
        RegistryContext.REGISTRY_ID_MAPPING[registry.toLowerCase()];
      registriesToSearch = registryUrl
        ? registriesToSearch.filter(([url]) => url === registryUrl)
        : registriesToSearch.filter(([url]) =>
            url.toLowerCase().includes(registry.toLowerCase()),
          );

      if (registriesToSearch.length === 0) {
        return {
          found: false,
          servers: [],
          message: `No registry found matching: ${registry}`,
        };
      }
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

    // Aggregate results and collect errors
    for (const { registryUrl, results, error } of searchResults) {
      if (error) {
        errors.push(`${registryUrl}: ${error}`);
      } else {
        allResults.push(
          ...results.map((server) => ({
            name: server.name,
            description: server.description,
            registryId:
              server._meta?.['io.modelcontextprotocol.registry/official']?.id ||
              server.id,
            isRemote: !!(server.remotes && server.remotes.length > 0),
            registryType:
              server.packages?.[0]?.registry_type ||
              server.registry_type ||
              (server.remotes && server.remotes.length > 0
                ? 'remote'
                : 'unknown'),
          })),
        );
      }
    }

    // Build response message
    const message =
      allResults.length > 0
        ? `Found ${allResults.length} servers${errors.length > 0 ? ` (${errors.length} registries had errors)` : ''}`
        : errors.length > 0
          ? `No servers found. Registry errors: ${errors.join(', ')}`
          : 'No servers found';

    return { found: allResults.length > 0, servers: allResults, message };
  }

  /** Retrieves detailed information for a specific server by its registry ID. */
  async getServerDetails(registryId: string): Promise<RegistryServer | null> {
    if (this.registryClients.size === 0) {
      console.warn(
        '[RegistryContext] No registries configured for server details lookup',
      );
      return null;
    }

    // Try each registry until server is found
    for (const [registryUrl, client] of this.registryClients.entries()) {
      try {
        const server = await client.getServer(registryId);
        if (server) return server;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `[RegistryContext] Failed to get server ${registryId} from ${registryUrl}:`,
          errorMessage,
        );
      }
    }

    return null;
  }

  /** Enables a temporary MCP server for testing or evaluation. */
  async enableTemporary(server: ServerConfig): Promise<string> {
    return await this.tempServerManager.spawn(server);
  }

  /** Converts a temporary server to a persistent configuration. */
  async persistTemporary(serverName: string): Promise<void> {
    const serverConfig = this.tempServerManager.getTemporary(serverName);
    if (!serverConfig)
      throw new Error(`Temporary server '${serverName}' not found`);
    await this.configManager.addServer(serverConfig);
  }

  /** Checks if any registries are configured and available. */
  hasRegistries(): boolean {
    return this.registryClients.size > 0;
  }

  /** Generates a server configuration from registry server data. */
  async generateServerConfig(server: RegistryServer): Promise<ServerConfig> {
    const configEntry = generateConfigSnippet(server);

    return {
      name: configEntry.name,
      command: configEntry.command,
      args: configEntry.args,
      env: configEntry.env,
      transport: configEntry.transport,
      url: configEntry.url,
      headers: this.convertHeaders(configEntry.headers),
    };
  }

  /** Generates comprehensive installation information for a server. */
  async generateInstallInfo(
    server: RegistryServer,
  ): Promise<RegistryInstallInfo> {
    const registryConfigEntry = generateConfigSnippet(server);
    const installInstructions = generateInstallInstructions(server);

    return {
      name: server.name,
      description: server.description,
      configSnippet: {
        name: registryConfigEntry.name,
        command: registryConfigEntry.command,
        args: registryConfigEntry.args,
        env: registryConfigEntry.env,
        transport: registryConfigEntry.transport,
        url: registryConfigEntry.url,
        headers: this.convertHeaders(registryConfigEntry.headers),
      },
      installInstructions,
      tools: server.tools,
    };
  }

  /** Converts headers from RegistryConfigEntry format to ServerConfig format. */
  private convertHeaders(
    headers: Record<string, string> | KeyValueInput[] | undefined,
  ): Record<string, string> | undefined {
    if (!headers) return undefined;
    if (Array.isArray(headers)) {
      const result: Record<string, string> = {};
      for (const header of headers) {
        result[header.name] = header.value || '';
      }
      return result;
    }
    return headers;
  }

  /** Extracts registry URLs from the proxy configuration. */
  private extractRegistryUrls(config: ProxyConfig): string[] {
    const registries = (config as ProxyConfig & { registries?: unknown })
      .registries;

    if (Array.isArray(registries)) {
      const validUrls = registries.filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      );
      if (validUrls.length > 0) return validUrls;
    }

    return ['https://registry.modelcontextprotocol.io'];
  }
}
