import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ProxyConfig } from '../config.js';
import type {
  ServerConfig,
  RegistrySearchResult,
  RegistryInstallInfo,
} from './index.js';

/**
 * Mock RegistryContext implementation for testing
 *
 * This mock implements the expected singleton behavior and registry operations
 * that will be required for the actual RegistryContext implementation.
 */
class MockRegistryContext {
  private static instance: MockRegistryContext | null = null;
  private registryUrls: string[] = [];
  private temporaryServers: Map<string, ServerConfig> = new Map();
  private cache: Map<string, unknown> = new Map();
  private isInitialized = false;

  private constructor(config: ProxyConfig) {
    this.initializeFromConfig(config);
  }

  static getInstance(config?: ProxyConfig): MockRegistryContext {
    if (!MockRegistryContext.instance) {
      if (!config) {
        throw new Error('Config required for first getInstance() call');
      }
      MockRegistryContext.instance = new MockRegistryContext(config);
    }
    return MockRegistryContext.instance;
  }

  static reset(): void {
    MockRegistryContext.instance = null;
  }

  private initializeFromConfig(_config: ProxyConfig): void {
    // Extract registry URLs from config (mock implementation)
    // In real implementation, this would parse config for registry settings
    this.registryUrls = [
      'https://registry.example.com/api',
      'https://backup-registry.example.com/api',
    ];
    this.isInitialized = true;
  }

  async searchServers(query: string): Promise<RegistrySearchResult> {
    if (!this.isInitialized) {
      throw new Error('RegistryContext not initialized');
    }

    if (this.registryUrls.length === 0) {
      return {
        found: false,
        servers: [],
        message: 'No registries configured',
      };
    }

    // Mock aggregating results from multiple registries
    const allResults: RegistrySearchResult['servers'] = [];
    const errors: string[] = [];

    for (const registryUrl of this.registryUrls) {
      try {
        // Mock registry search call
        const mockResult = this.mockRegistrySearch(registryUrl, query);
        if (mockResult.servers) {
          allResults.push(...mockResult.servers);
        }
      } catch (error) {
        errors.push(`Error from ${registryUrl}: ${error}`);
        // Continue with other registries
      }
    }

    return {
      found: allResults.length > 0,
      servers: allResults,
      message:
        allResults.length > 0
          ? `Found ${allResults.length} servers`
          : errors.length > 0
            ? `No servers found. Errors: ${errors.join(', ')}`
            : 'No servers found',
    };
  }

  async getServerDetails(
    serverId: string,
  ): Promise<RegistryInstallInfo | null> {
    if (!this.isInitialized) {
      throw new Error('RegistryContext not initialized');
    }

    // Try each registry until found
    for (const registryUrl of this.registryUrls) {
      try {
        const details = this.mockGetServerDetails(registryUrl, serverId);
        if (details) {
          return details;
        }
      } catch {
        // Continue with next registry
        continue;
      }
    }

    return null;
  }

  // Extension points for Phase 2
  async enableTemporary(config: ServerConfig): Promise<string> {
    const serverId = `temp_${config.name}_${Date.now()}`;
    this.temporaryServers.set(serverId, config);
    return serverId;
  }

  async persistTemporary(serverId: string): Promise<ServerConfig | null> {
    const serverConfig = this.temporaryServers.get(serverId);
    if (!serverConfig) {
      return null;
    }

    // In real implementation, this would save to persistent config
    // For now, just return the config that would be saved
    return serverConfig;
  }

  // Cache management
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Mock helper methods
  private mockRegistrySearch(
    registryUrl: string,
    query: string,
  ): RegistrySearchResult {
    if (registryUrl.includes('backup-registry') && query === 'error') {
      throw new Error('Registry unavailable');
    }

    if (query === 'filesystem') {
      return {
        found: true,
        servers: [
          {
            name: 'filesystem-server',
            description: 'MCP server for filesystem operations',
            registryId: 'fs-001',
            isRemote: false,
            registryType: 'npm',
          },
        ],
        message: 'Found 1 server',
      };
    }

    return {
      found: false,
      servers: [],
      message: 'No servers found',
    };
  }

  private mockGetServerDetails(
    registryUrl: string,
    serverId: string,
  ): RegistryInstallInfo | null {
    if (
      registryUrl.includes('backup-registry') &&
      serverId === 'error-server'
    ) {
      throw new Error('Server details unavailable');
    }

    if (serverId === 'fs-001') {
      return {
        name: 'filesystem-server',
        description: 'MCP server for filesystem operations',
        configSnippet: {
          name: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        },
        installInstructions:
          'npm install -g @modelcontextprotocol/server-filesystem',
        tools: ['read_file', 'write_file', 'list_directory'],
      };
    }

    return null;
  }
}

describe('RegistryContext', () => {
  const mockConfig: ProxyConfig = {
    servers: [
      {
        name: 'test-server',
        command: 'echo',
        args: ['test'],
      },
    ],
  };

  beforeEach(() => {
    MockRegistryContext.reset();
  });

  afterEach(() => {
    MockRegistryContext.reset();
  });

  describe('Singleton Pattern', () => {
    it.skip('should return same instance on subsequent calls', () => {
      const instance1 = MockRegistryContext.getInstance(mockConfig);
      const instance2 = MockRegistryContext.getInstance();

      expect(instance1).toBe(instance2);
    });

    it.skip('should require config on first access', () => {
      expect(() => MockRegistryContext.getInstance()).toThrow(
        'Config required for first getInstance() call',
      );
    });

    it.skip('should throw error if no config provided on first access', () => {
      expect(() => MockRegistryContext.getInstance()).toThrow();
    });

    it.skip('should allow reset of singleton instance', () => {
      const instance1 = MockRegistryContext.getInstance(mockConfig);
      MockRegistryContext.reset();

      // Should require config again after reset
      expect(() => MockRegistryContext.getInstance()).toThrow(
        'Config required for first getInstance() call',
      );

      const instance2 = MockRegistryContext.getInstance(mockConfig);
      expect(instance1).not.toBe(instance2);
    });

    it.skip('should not require config after first initialization', () => {
      MockRegistryContext.getInstance(mockConfig);

      // Should not throw on subsequent calls without config
      expect(() => MockRegistryContext.getInstance()).not.toThrow();
    });
  });

  describe('Registry Client Initialization', () => {
    it.skip('should create clients for each registry URL in config', () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      // In real implementation, this would verify registry clients are created
      // For now, we verify the context is properly initialized
      expect(context).toBeDefined();
      expect(context['isInitialized']).toBe(true);
    });

    it.skip('should handle empty registry list gracefully', () => {
      const emptyConfig: ProxyConfig = { servers: [] };
      const context = MockRegistryContext.getInstance(emptyConfig);

      expect(context).toBeDefined();
      expect(context['registryUrls']).toBeDefined();
    });

    it.skip('should initialize with multiple registry URLs', () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      // Verify multiple registries are configured
      expect(context['registryUrls']).toEqual([
        'https://registry.example.com/api',
        'https://backup-registry.example.com/api',
      ]);
    });
  });

  describe('searchServers() method', () => {
    it.skip('should aggregate results from multiple registries', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      const result = await context.searchServers('filesystem');

      expect(result.found).toBe(true);
      expect(result.servers).toHaveLength(1);
      expect(result.servers?.[0]?.name).toBe('filesystem-server');
      expect(result.message).toContain('Found 1 server');
    });

    it.skip('should handle errors from individual registries gracefully', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      const result = await context.searchServers('error');

      expect(result.found).toBe(false);
      expect(result.servers).toHaveLength(0);
      expect(result.message).toContain('Registry unavailable');
    });

    it.skip('should return empty array when no registries configured', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);
      context['registryUrls'] = [];

      const result = await context.searchServers('anything');

      expect(result.found).toBe(false);
      expect(result.servers).toHaveLength(0);
      expect(result.message).toBe('No registries configured');
    });

    it.skip('should handle no results found across all registries', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      const result = await context.searchServers('nonexistent');

      expect(result.found).toBe(false);
      expect(result.servers).toHaveLength(0);
      expect(result.message).toBe('No servers found');
    });

    it.skip('should throw if context not initialized', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);
      context['isInitialized'] = false;

      await expect(context.searchServers('test')).rejects.toThrow(
        'RegistryContext not initialized',
      );
    });
  });

  describe('getServerDetails() method', () => {
    it.skip('should try each registry until server found', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      const details = await context.getServerDetails('fs-001');

      expect(details).not.toBeNull();
      expect(details?.name).toBe('filesystem-server');
      expect(details?.configSnippet.command).toBe('npx');
      expect(details?.tools).toContain('read_file');
    });

    it.skip('should return null if server not found in any registry', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      const details = await context.getServerDetails('nonexistent-server');

      expect(details).toBeNull();
    });

    it.skip('should continue to next registry on error', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      const details = await context.getServerDetails('error-server');

      expect(details).toBeNull();
    });

    it.skip('should throw if context not initialized', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);
      context['isInitialized'] = false;

      await expect(context.getServerDetails('test')).rejects.toThrow(
        'RegistryContext not initialized',
      );
    });
  });

  describe('Extension Points (Phase 2)', () => {
    describe('enableTemporary()', () => {
      it.skip('should accept server config and return server ID', async () => {
        const context = MockRegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'temp-test',
          command: 'node',
          args: ['server.js'],
        };

        const serverId = await context.enableTemporary(serverConfig);

        expect(serverId).toMatch(/^temp_temp-test_\d+$/);
        expect(context['temporaryServers'].has(serverId)).toBe(true);
      });

      it.skip('should store server config in temporary registry', async () => {
        const context = MockRegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'temp-test',
          command: 'python',
          args: ['-m', 'server'],
          env: { PYTHON_PATH: '/opt/python' },
        };

        const serverId = await context.enableTemporary(serverConfig);
        const storedConfig = context['temporaryServers'].get(serverId);

        expect(storedConfig).toEqual(serverConfig);
      });
    });

    describe('persistTemporary()', () => {
      it.skip('should return config for saving to persistent storage', async () => {
        const context = MockRegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'temp-to-persist',
          command: 'docker',
          args: ['run', 'server-image'],
        };

        const serverId = await context.enableTemporary(serverConfig);
        const persistedConfig = await context.persistTemporary(serverId);

        expect(persistedConfig).toEqual(serverConfig);
      });

      it.skip('should return null for non-existent server ID', async () => {
        const context = MockRegistryContext.getInstance(mockConfig);

        const result = await context.persistTemporary('nonexistent-id');

        expect(result).toBeNull();
      });

      it.skip('should handle server ID that was already persisted', async () => {
        const context = MockRegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'already-persisted',
          command: 'test',
        };

        const serverId = await context.enableTemporary(serverConfig);

        // First persistence should succeed
        const firstResult = await context.persistTemporary(serverId);
        expect(firstResult).toEqual(serverConfig);

        // Should still return the config on subsequent calls
        const secondResult = await context.persistTemporary(serverId);
        expect(secondResult).toEqual(serverConfig);
      });
    });
  });

  describe('Shared Cache', () => {
    it.skip('should maintain cache across operations', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      const initialCacheStats = context.getCacheStats();
      expect(initialCacheStats.size).toBe(0);

      // Perform operations that would populate cache
      await context.searchServers('filesystem');
      await context.getServerDetails('fs-001');

      // Verify cache behavior (in real implementation, this would show cached items)
      expect(context.getCacheStats()).toBeDefined();
    });

    it.skip('should allow cache clearing', () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      // Add something to cache (in real implementation)
      context['cache'].set('test-key', 'test-value');

      expect(context.getCacheStats().size).toBe(1);

      context.clearCache();

      expect(context.getCacheStats().size).toBe(0);
    });

    it.skip('should share cache between different method calls', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      // In real implementation, verify that search results are cached
      // and subsequent getServerDetails calls use the cache
      await context.searchServers('filesystem');
      const cacheAfterSearch = context.getCacheStats();

      await context.getServerDetails('fs-001');
      const cacheAfterDetails = context.getCacheStats();

      // Cache should maintain state across operations
      expect(cacheAfterDetails.size).toBeGreaterThanOrEqual(
        cacheAfterSearch.size,
      );
    });

    it.skip('should provide cache statistics', () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      context['cache'].set('key1', 'value1');
      context['cache'].set('key2', 'value2');

      const stats = context.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
    });
  });

  describe('Error Handling', () => {
    it.skip('should handle network timeouts gracefully', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      // Mock network timeout scenario
      const originalMethod = context['mockRegistrySearch'];
      context['mockRegistrySearch'] = () => {
        throw new Error('Network timeout');
      };

      const result = await context.searchServers('test');

      expect(result.found).toBe(false);
      expect(result.message).toContain('Network timeout');

      // Restore original method
      context['mockRegistrySearch'] = originalMethod;
    });

    it.skip('should handle invalid registry responses', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      // Mock invalid response scenario
      const originalMethod = context['mockGetServerDetails'];
      context['mockGetServerDetails'] = () => {
        throw new Error('Invalid JSON response');
      };

      const result = await context.getServerDetails('test-server');

      expect(result).toBeNull();

      // Restore original method
      context['mockGetServerDetails'] = originalMethod;
    });

    it.skip('should handle concurrent requests safely', async () => {
      const context = MockRegistryContext.getInstance(mockConfig);

      // Test concurrent access
      const promises = [
        context.searchServers('filesystem'),
        context.searchServers('filesystem'),
        context.getServerDetails('fs-001'),
        context.getServerDetails('fs-001'),
      ];

      const results = await Promise.all(promises);

      // All requests should complete successfully
      expect(results).toHaveLength(4);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });

  describe('Configuration Edge Cases', () => {
    it.skip('should handle malformed config gracefully', () => {
      const malformedConfig = {} as ProxyConfig;

      expect(() =>
        MockRegistryContext.getInstance(malformedConfig),
      ).not.toThrow();
    });

    it.skip('should handle config with no servers', () => {
      const emptyConfig: ProxyConfig = { servers: [] };

      const context = MockRegistryContext.getInstance(emptyConfig);

      expect(context).toBeDefined();
    });

    it.skip('should handle config with invalid registry URLs', () => {
      const invalidConfig: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
          },
        ],
      };

      expect(() =>
        MockRegistryContext.getInstance(invalidConfig),
      ).not.toThrow();
    });
  });
});
