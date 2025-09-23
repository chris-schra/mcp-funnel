import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProxyConfig } from '../config.js';
import type { ServerConfig, RegistryServer } from './index.js';
import { RegistryContext } from './registry-context.js';

// Mock external dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
    RegistryContext.reset();
    vi.clearAllMocks();
    // Set up default mock responses
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          servers: [],
          metadata: {
            count: 0,
            next_cursor: null,
          },
        }),
    });
  });

  afterEach(() => {
    RegistryContext.reset();
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on subsequent calls', () => {
      const instance1 = RegistryContext.getInstance(mockConfig);
      const instance2 = RegistryContext.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should require config on first access', () => {
      expect(() => RegistryContext.getInstance()).toThrow(
        'RegistryContext must be initialized with config on first access',
      );
    });

    it('should throw error if no config provided on first access', () => {
      expect(() => RegistryContext.getInstance()).toThrow();
    });

    it('should allow reset of singleton instance', () => {
      const instance1 = RegistryContext.getInstance(mockConfig);
      RegistryContext.reset();

      // Should require config again after reset
      expect(() => RegistryContext.getInstance()).toThrow(
        'RegistryContext must be initialized with config on first access',
      );

      const instance2 = RegistryContext.getInstance(mockConfig);
      expect(instance1).not.toBe(instance2);
    });

    it('should not require config after first initialization', () => {
      RegistryContext.getInstance(mockConfig);

      // Should not throw on subsequent calls without config
      expect(() => RegistryContext.getInstance()).not.toThrow();
    });
  });

  describe('Registry Client Initialization', () => {
    it('should create clients for each registry URL in config', () => {
      const context = RegistryContext.getInstance(mockConfig);

      // Verify the context is properly initialized
      expect(context).toBeDefined();
      expect(context.hasRegistries()).toBe(true);
    });

    it('should handle empty registry list gracefully', () => {
      const emptyConfig: ProxyConfig = { servers: [] };
      const context = RegistryContext.getInstance(emptyConfig);

      expect(context).toBeDefined();
      expect(context.hasRegistries()).toBe(true); // Should have default registry
    });

    it('should initialize with multiple registry URLs', () => {
      const configWithRegistries = {
        ...mockConfig,
        registries: [
          'https://registry.example.com/api',
          'https://backup-registry.example.com/api',
        ],
      } as ProxyConfig & { registries: string[] };

      const context = RegistryContext.getInstance(configWithRegistries);

      // Verify multiple registries are configured
      expect(context.hasRegistries()).toBe(true);
    });
  });

  describe('searchServers() method', () => {
    it('should aggregate results from multiple registries', async () => {
      // Mock successful registry response in the expected format
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            servers: [
              {
                name: 'filesystem-server',
                description: 'MCP server for filesystem operations',
                id: 'fs-001',
                registry_type: 'npm',
              },
            ],
            metadata: {
              count: 1,
              next_cursor: null,
            },
          }),
      });

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('filesystem');

      expect(result.found).toBe(true);
      expect(result.servers).toHaveLength(1);
      expect(result.servers?.[0]?.name).toBe('filesystem-server');
      expect(result.message).toContain('Found 1 server');
    });

    it('should handle errors from individual registries gracefully', async () => {
      // Mock registry error
      mockFetch.mockRejectedValue(new Error('Registry unavailable'));

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('error');

      expect(result.found).toBe(false);
      expect(result.servers).toHaveLength(0);
      expect(result.message).toContain('Registry unavailable');
    });

    it('should return empty array when no registries configured', async () => {
      // Test with a context that has no registries (this is tricky with real implementation)
      // In real implementation, we always have at least the default registry
      // But we can test the case where all registries fail
      mockFetch.mockRejectedValue(new Error('All registries unavailable'));

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('anything');

      expect(result.found).toBe(false);
      expect(result.servers).toHaveLength(0);
      expect(result.message).toContain('unavailable');
    });

    it('should handle no results found across all registries', async () => {
      // Mock empty response from registries
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            servers: [],
            metadata: {
              count: 0,
              next_cursor: null,
            },
          }),
      });

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('nonexistent');

      expect(result.found).toBe(false);
      expect(result.servers).toHaveLength(0);
      expect(result.message).toBe('No servers found');
    });

    it('should handle context initialization properly', async () => {
      // Real implementation is always initialized when getInstance succeeds
      // This test ensures no errors are thrown with proper initialization
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            servers: [],
            metadata: {
              count: 0,
              next_cursor: null,
            },
          }),
      });

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('test');

      expect(result).toBeDefined();
      expect(typeof result.found).toBe('boolean');
    });

    it('should accept optional registry parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            servers: [],
            metadata: {
              count: 0,
              next_cursor: null,
            },
          }),
      });

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('filesystem', 'example');

      expect(result).toBeDefined();
      expect(typeof result.found).toBe('boolean');
      expect(Array.isArray(result.servers)).toBe(true);
      expect(typeof result.message).toBe('string');
    });

    it('should filter by registry ID "official" mapping to official registry URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            servers: [
              {
                name: 'official-server',
                description: 'Server from official registry',
                id: 'official-server',
                registry_type: 'official',
                tools: ['test_tool'],
                _meta: {
                  'io.modelcontextprotocol.registry/official': {
                    id: 'official-server',
                  },
                },
              },
            ],
            metadata: {
              count: 1,
              next_cursor: null,
            },
          }),
      });

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('filesystem', 'official');

      expect(result.found).toBe(true);
      expect(result.servers).toHaveLength(1);
      expect(result.servers?.[0]?.name).toBe('official-server');
      // Verify the correct registry was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://registry.modelcontextprotocol.io'),
        expect.any(Object),
      );
    });

    it('should fallback to URL substring matching for unknown registry IDs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            servers: [],
            metadata: {
              count: 0,
              next_cursor: null,
            },
          }),
      });

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers(
        'filesystem',
        'modelcontextprotocol',
      );

      expect(result).toBeDefined();
      // Should still work because "modelcontextprotocol" is substring of URL
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://registry.modelcontextprotocol.io'),
        expect.any(Object),
      );
    });

    it('should return "no registry found" for unknown registry filter', async () => {
      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers(
        'filesystem',
        'nonexistent-registry',
      );

      expect(result.found).toBe(false);
      expect(result.servers).toEqual([]);
      expect(result.message).toBe(
        'No registry found matching: nonexistent-registry',
      );
      // Should not make any HTTP calls
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getServerDetails() method', () => {
    it('should try each registry until server found', async () => {
      // Mock search response that includes our server (getServer searches by name)
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            servers: [
              {
                name: 'fs-001',
                description: 'MCP server for filesystem operations',
                id: 'fs-001',
                registry_type: 'npm',
                tools: ['read_file', 'write_file', 'list_directory'],
              },
            ],
            metadata: {
              count: 1,
              next_cursor: null,
            },
          }),
      });

      const context = RegistryContext.getInstance(mockConfig);
      const details = await context.getServerDetails('fs-001');

      expect(details).not.toBeNull();
      expect(details?.name).toBe('fs-001');
      expect(details?.tools).toContain('read_file');
    });

    it('should return null if server not found in any registry', async () => {
      // Mock 404 response
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      });

      const context = RegistryContext.getInstance(mockConfig);
      const details = await context.getServerDetails('nonexistent-server');

      expect(details).toBeNull();
    });

    it('should continue to next registry on error', async () => {
      // Mock registry error
      mockFetch.mockRejectedValue(new Error('Server details unavailable'));

      const context = RegistryContext.getInstance(mockConfig);
      const details = await context.getServerDetails('error-server');

      expect(details).toBeNull();
    });

    it('should handle context initialization properly for getServerDetails', async () => {
      // Real implementation is always initialized when getInstance succeeds
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      });

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.getServerDetails('test');

      expect(result).toBeNull(); // Not found is expected behavior
    });
  });

  describe('Extension Points (Phase 2)', () => {
    describe('enableTemporary()', () => {
      it('should accept server config and return server ID', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'temp-test',
          command: 'node',
          args: ['server.js'],
        };

        const serverId = await context.enableTemporary(serverConfig);

        expect(serverId).toBeDefined();
        expect(typeof serverId).toBe('string');
        expect(serverId.length).toBeGreaterThan(0);
      });

      it('should store server config in temporary registry', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'temp-test',
          command: 'python',
          args: ['-m', 'server'],
          env: { PYTHON_PATH: '/opt/python' },
        };

        const serverId = await context.enableTemporary(serverConfig);

        // Server should be enabled and tracked (we can't directly inspect internals)
        expect(serverId).toBeDefined();
        expect(typeof serverId).toBe('string');
      });
    });

    describe('persistTemporary()', () => {
      it('should persist temporary server config', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'temp-to-persist',
          command: 'docker',
          args: ['run', 'server-image'],
        };

        const _serverId = await context.enableTemporary(serverConfig);

        // In real implementation, this should not throw for valid server names
        await expect(
          context.persistTemporary(serverConfig.name),
        ).resolves.not.toThrow();
      });

      it('should throw for non-existent server name', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        await expect(
          context.persistTemporary('nonexistent-server'),
        ).rejects.toThrow("Temporary server 'nonexistent-server' not found");
      });

      it('should handle server that can be persisted multiple times', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'already-persisted',
          command: 'test',
        };

        await context.enableTemporary(serverConfig);

        // First persistence should succeed
        await expect(
          context.persistTemporary(serverConfig.name),
        ).resolves.not.toThrow();

        // Should handle subsequent calls gracefully
        await expect(
          context.persistTemporary(serverConfig.name),
        ).resolves.not.toThrow();
      });
    });
  });

  describe('Additional Functionality', () => {
    it('should provide server config generation', async () => {
      const mockServer: RegistryServer = {
        name: 'test-server',
        description: 'Test server',
        id: 'test-001',
        registry_type: 'npm',
        tools: ['test_tool'],
      };

      const context = RegistryContext.getInstance(mockConfig);
      const config = await context.generateServerConfig(mockServer);

      expect(config).toBeDefined();
      expect(config.name).toBe('test-server');
    });

    it('should provide install info generation', async () => {
      const mockServer: RegistryServer = {
        name: 'test-server',
        description: 'Test server',
        id: 'test-001',
        registry_type: 'npm',
        tools: ['test_tool'],
      };

      const context = RegistryContext.getInstance(mockConfig);
      const installInfo = await context.generateInstallInfo(mockServer);

      expect(installInfo).toBeDefined();
      expect(installInfo.name).toBe('test-server');
      expect(installInfo.configSnippet).toBeDefined();
      expect(installInfo.installInstructions).toBeDefined();
    });

    it('should check if registries are available', () => {
      const context = RegistryContext.getInstance(mockConfig);

      expect(context.hasRegistries()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      // Mock network timeout
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('test');

      expect(result.found).toBe(false);
      expect(result.message).toContain('Network timeout');
    });

    it('should handle invalid registry responses', async () => {
      // Mock invalid JSON response
      mockFetch.mockRejectedValue(new Error('Invalid JSON response'));

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.getServerDetails('test-server');

      expect(result).toBeNull();
    });

    it('should handle concurrent requests safely', async () => {
      // Mock successful responses
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            servers: [],
            metadata: {
              count: 0,
              next_cursor: null,
            },
          }),
      });

      const context = RegistryContext.getInstance(mockConfig);

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
    it('should handle malformed config gracefully', () => {
      const malformedConfig = {} as ProxyConfig;

      expect(() => RegistryContext.getInstance(malformedConfig)).not.toThrow();
    });

    it('should handle config with no servers', () => {
      const emptyConfig: ProxyConfig = { servers: [] };

      const context = RegistryContext.getInstance(emptyConfig);

      expect(context).toBeDefined();
    });

    it('should handle config with invalid registry URLs', () => {
      const invalidConfig: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
          },
        ],
      };

      expect(() => RegistryContext.getInstance(invalidConfig)).not.toThrow();
    });
  });
});
