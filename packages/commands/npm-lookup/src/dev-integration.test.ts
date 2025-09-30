import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPProxy } from 'mcp-funnel';
import { NPMCommand } from './command.js';
import type { NPMClient } from './npm-client.js';
import { z } from 'zod';
import { ProxyConfigSchema } from '@mcp-funnel/schemas';

type ProxyConfig = z.infer<typeof ProxyConfigSchema>;

// Mock NPMClient to avoid real network calls
vi.mock('./npm-client.js', () => {
  const MockNPMClient = vi.fn().mockImplementation(() => ({
    getPackage: vi.fn().mockResolvedValue({
      name: 'react',
      version: '18.2.0',
      description:
        'React is a JavaScript library for building user interfaces.',
      author: 'Meta Platforms, Inc.',
      license: 'MIT',
      homepage: 'https://reactjs.org',
      repository: {
        type: 'git',
        url: 'git+https://github.com/facebook/react.git',
      },
      keywords: ['react', 'javascript', 'ui'],
      dependencies: { 'loose-envify': '^1.1.0' },
      devDependencies: { typescript: '^4.0.0' },
      publishedAt: '2022-06-14T20:00:00.000Z',
      readme: 'React documentation...',
    }),
    searchPackages: vi.fn().mockResolvedValue({
      results: [
        {
          name: 'react',
          version: '18.2.0',
          description:
            'React is a JavaScript library for building user interfaces.',
          author: 'Meta Platforms, Inc.',
          keywords: ['react', 'javascript'],
          date: '2022-06-14T20:00:00.000Z',
          score: 0.95,
        },
      ],
      total: 1,
    }),
  }));

  return {
    NPMClient: MockNPMClient,
    PackageNotFoundError: vi.fn(),
    NPMRegistryError: vi.fn(),
  };
});

describe('Command Integration', () => {
  describe('MCP tool exposure', () => {
    let mockNPMClient: NPMClient;

    beforeEach(() => {
      mockNPMClient = {
        getPackage: vi.fn().mockResolvedValue({
          name: 'react',
          version: '18.2.0',
          description:
            'React is a JavaScript library for building user interfaces.',
          author: 'Meta Platforms, Inc.',
          license: 'MIT',
          homepage: 'https://reactjs.org',
          repository: {
            type: 'git',
            url: 'git+https://github.com/facebook/react.git',
          },
          keywords: ['react', 'javascript', 'ui'],
          dependencies: { 'loose-envify': '^1.1.0' },
          devDependencies: { typescript: '^4.0.0' },
          publishedAt: '2022-06-14T20:00:00.000Z',
          readme: 'React documentation...',
        }),
        searchPackages: vi.fn().mockResolvedValue({
          results: [
            {
              name: 'react',
              version: '18.2.0',
              description:
                'React is a JavaScript library for building user interfaces.',
              author: 'Meta Platforms, Inc.',
              keywords: ['react', 'javascript'],
              date: '2022-06-14T20:00:00.000Z',
              score: 0.95,
            },
          ],
          total: 1,
        }),
      } as unknown as NPMClient;
    });

    it('should expose npm_lookup when commands enabled', async () => {
      const config: ProxyConfig = {
        servers: [], // No external servers for this test
        commands: { enabled: true, list: ['npm'] },
      };

      const proxy = new MCPProxy(config, './test-config.json');
      await proxy.initialize();

      // Check that command tools are in the tool definition cache
      const toolDefinitionCache = proxy.toolDefinitionCache;

      // Verify npm_lookup is registered
      expect(toolDefinitionCache.has('npm_lookup')).toBe(true);
      expect(toolDefinitionCache.has('npm_search')).toBe(true);

      const lookupTool = toolDefinitionCache.get('npm_lookup');
      const searchTool = toolDefinitionCache.get('npm_search');

      expect(lookupTool).toBeDefined();
      expect(lookupTool!.serverName).toBe('commands');
      expect(lookupTool!.tool.name).toBe('npm_lookup');
      expect(lookupTool!.tool.description).toBe(
        'Get detailed information about an NPM package',
      );

      expect(searchTool).toBeDefined();
      expect(searchTool!.serverName).toBe('commands');
      expect(searchTool!.tool.name).toBe('npm_search');
      expect(searchTool!.tool.description).toBe('Search for NPM packages');

      // Verify tools have correct input schemas
      expect(lookupTool!.tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          packageName: {
            type: 'string',
            description: 'Package name',
          },
          version: {
            type: 'string',
            description: 'Specific version (optional)',
          },
        },
        required: ['packageName'],
      });

      expect(searchTool!.tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          limit: {
            type: 'number',
            description: 'Max results (default: 20, max: 50)',
          },
        },
        required: ['query'],
      });
    });

    it('should execute tools via MCP interface', async () => {
      const _config: ProxyConfig = {
        servers: [],
        commands: { enabled: true, list: ['npm'] },
      };

      // Create NPMCommand with injected mock client
      const npmCommand = new NPMCommand(mockNPMClient);

      // Test lookup tool execution via MCP
      const lookupResult = await npmCommand.executeToolViaMCP('lookup', {
        packageName: 'react',
      });

      expect(lookupResult.content).toBeDefined();
      expect(lookupResult.content[0].type).toBe('text');
      expect(lookupResult.isError).toBeUndefined();

      // Parse the returned JSON to verify structure
      const lookupData = JSON.parse(lookupResult.content[0].text as string);
      expect(lookupData.name).toBe('react');
      expect(lookupData.version).toBe('18.2.0');
      expect(lookupData.description).toContain('React is a JavaScript library');

      // Test search tool execution via MCP
      const searchResult = await npmCommand.executeToolViaMCP('search', {
        query: 'react',
        limit: 10,
      });

      expect(searchResult.content).toBeDefined();
      expect(searchResult.content[0].type).toBe('text');
      expect(searchResult.isError).toBeUndefined();

      // Parse the returned JSON to verify structure
      const searchData = JSON.parse(searchResult.content[0].text as string);
      expect(searchData.results).toBeInstanceOf(Array);
      expect(searchData.results[0].name).toBe('react');
      expect(searchData.total).toBe(1);

      // Verify mock clients were called correctly
      expect(mockNPMClient.getPackage).toHaveBeenCalledWith('react');
      expect(mockNPMClient.searchPackages).toHaveBeenCalledWith('react', 10);
    });

    it('should respect filtering configuration', async () => {
      // Test with exposeTools filtering
      const _configWithExpose: ProxyConfig = {
        servers: [],
        commands: { enabled: true, list: ['npm'] },
        exposeTools: ['npm_lookup'], // Only expose lookup tool
      };

      const proxyWithExpose = new MCPProxy(
        _configWithExpose,
        './test-config.json',
      );
      await proxyWithExpose.initialize();

      // Check tool definition cache - both should be registered for discovery
      const toolDefinitionCache = proxyWithExpose.toolDefinitionCache;
      expect(toolDefinitionCache.has('npm_lookup')).toBe(true);
      expect(toolDefinitionCache.has('npm_search')).toBe(true);

      // Test with hideTools filtering
      const _configWithHide: ProxyConfig = {
        servers: [],
        commands: { enabled: true, list: ['npm'] },
        hideTools: ['npm_search'], // Hide search tool
      };

      const proxyWithHide = new MCPProxy(_configWithHide, './test-config.json');
      await proxyWithHide.initialize();

      // Check tool definition cache - hidden tools should NOT be in cache (firewall behavior)
      const toolDefinitionCacheHide = proxyWithHide.toolDefinitionCache;
      expect(toolDefinitionCacheHide.has('npm_lookup')).toBe(true);
      expect(toolDefinitionCacheHide.has('npm_search')).toBe(false); // Hidden tools are firewalled
    });

    it('should not expose commands when disabled', async () => {
      const config: ProxyConfig = {
        servers: [],
        commands: { enabled: false }, // Commands disabled
      };

      const proxy = new MCPProxy(config, './test-config.json');
      await proxy.initialize();

      // Check that no command tools are registered
      const toolDefinitionCache = proxy.toolDefinitionCache;
      expect(toolDefinitionCache.has('npm_lookup')).toBe(false);
      expect(toolDefinitionCache.has('npm_search')).toBe(false);
    });

    it('should only expose specified commands in list', async () => {
      const config: ProxyConfig = {
        servers: [],
        commands: { enabled: true, list: ['other-command'] }, // Not including 'npm'
      };

      const proxy = new MCPProxy(config, './test-config.json');
      await proxy.initialize();

      // Check that npm tools are not registered when npm is not in the list
      const toolDefinitionCache = proxy.toolDefinitionCache;
      expect(toolDefinitionCache.has('npm_lookup')).toBe(false);
      expect(toolDefinitionCache.has('npm_search')).toBe(false);
    });

    it('should handle tool execution errors gracefully', async () => {
      const _config: ProxyConfig = {
        servers: [],
        commands: { enabled: true, list: ['npm'] },
      };

      // Create command with mock that throws errors
      const errorMockClient = {
        getPackage: vi.fn().mockRejectedValue(new Error('Network error')),
        searchPackages: vi.fn().mockRejectedValue(new Error('Search failed')),
      } as unknown as NPMClient;

      const npmCommand = new NPMCommand(errorMockClient);

      // Test error handling for lookup
      const lookupResult = await npmCommand.executeToolViaMCP('lookup', {
        packageName: 'nonexistent',
      });

      expect(lookupResult.isError).toBe(true);
      expect(lookupResult.content[0].text).toContain(
        'Unexpected error: Network error',
      );

      // Test error handling for search
      const searchResult = await npmCommand.executeToolViaMCP('search', {
        query: 'fail',
      });

      expect(searchResult.isError).toBe(true);
      expect(searchResult.content[0].text).toContain(
        'Unexpected error: Search failed',
      );
    });

    it('should validate tool parameters correctly', async () => {
      const npmCommand = new NPMCommand(mockNPMClient);

      // Test missing required parameter for lookup
      const lookupResult = await npmCommand.executeToolViaMCP('lookup', {});
      expect(lookupResult.isError).toBe(true);
      expect(lookupResult.content[0].text).toBe(
        'Error: packageName parameter must be a string',
      );

      // Test missing required parameter for search
      const searchResult = await npmCommand.executeToolViaMCP('search', {});
      expect(searchResult.isError).toBe(true);
      expect(searchResult.content[0].text).toBe(
        'Error: query parameter must be a string',
      );

      // Test invalid limit parameter for search
      const searchWithInvalidLimit = await npmCommand.executeToolViaMCP(
        'search',
        {
          query: 'react',
          limit: 100, // Exceeds max limit
        },
      );
      expect(searchWithInvalidLimit.isError).toBe(true);
      expect(searchWithInvalidLimit.content[0].text).toBe(
        'Error: limit must be a number between 1 and 50',
      );

      // Test unknown tool
      const unknownToolResult = await npmCommand.executeToolViaMCP(
        'unknown',
        {},
      );
      expect(unknownToolResult.isError).toBe(true);
      expect(unknownToolResult.content[0].text).toBe(
        'Error: Unknown tool: unknown',
      );
    });
  });
});
