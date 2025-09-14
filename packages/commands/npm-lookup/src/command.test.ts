import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NPMCommand } from './command.js';
import type { NPMClient } from './npm-client.js';
// NPMClient is mocked below, not directly imported for implementation

// Mock the NPM client
vi.mock('./npm-client.js', () => {
  const mockClient = {
    getPackage: vi.fn(),
    searchPackages: vi.fn(),
  };

  return {
    NPMClient: vi.fn(() => mockClient),
    PackageNotFoundError: class extends Error {
      constructor(packageName: string) {
        super(`Package "${packageName}" not found on NPM registry`);
        this.name = 'PackageNotFoundError';
      }
    },
    NPMRegistryError: class extends Error {
      constructor(
        message: string,
        public statusCode?: number,
      ) {
        super(message);
        this.name = 'NPMRegistryError';
      }
    },
  };
});

describe('NPMCommand', () => {
  let command: NPMCommand;
  let mockClient: {
    getPackage: ReturnType<typeof vi.fn>;
    searchPackages: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create mock client directly
    mockClient = {
      getPackage: vi.fn(),
      searchPackages: vi.fn(),
    };
    command = new NPMCommand(mockClient as unknown as NPMClient);
  });

  describe('getMCPDefinitions', () => {
    it('should return lookup and search tool definitions', () => {
      const definitions = command.getMCPDefinitions();

      expect(definitions).toHaveLength(2);
      expect(definitions[0].name).toBe('lookup');
      expect(definitions[1].name).toBe('search');
    });

    it('should have correct schema for lookup tool', () => {
      const definitions = command.getMCPDefinitions();
      const lookupTool = definitions.find((tool) => tool.name === 'lookup');

      expect(lookupTool).toBeDefined();
      expect(lookupTool?.inputSchema.properties).toHaveProperty('packageName');
      expect(lookupTool?.inputSchema.required).toContain('packageName');
    });

    it('should have correct schema for search tool', () => {
      const definitions = command.getMCPDefinitions();
      const searchTool = definitions.find((tool) => tool.name === 'search');

      expect(searchTool).toBeDefined();
      expect(searchTool?.inputSchema.properties).toHaveProperty('query');
      expect(searchTool?.inputSchema.properties).toHaveProperty('limit');
      expect(searchTool?.inputSchema.required).toContain('query');
    });
  });

  describe('executeToolViaMCP', () => {
    const mockPackageInfo = {
      name: 'lodash',
      version: '4.17.21',
      description: 'Lodash modular utilities.',
      publishedAt: '2021-02-20T16:23:21.141Z',
    };

    const mockSearchResults = {
      results: [
        {
          name: 'lodash',
          version: '4.17.21',
          description: 'Lodash modular utilities.',
          date: '2021-02-20T16:23:21.141Z',
          score: 0.95,
        },
      ],
      total: 1,
    };

    describe('lookup tool', () => {
      it('should successfully lookup a package', async () => {
        mockClient.getPackage.mockResolvedValueOnce(mockPackageInfo);

        const result = await command.executeToolViaMCP('lookup', {
          packageName: 'lodash',
        });

        expect(mockClient.getPackage).toHaveBeenCalledWith('lodash');
        expect(result.content[0].text).toContain('"name": "lodash"');
        expect(result.isError).toBeUndefined();
      });

      it('should return error for missing packageName parameter', async () => {
        const result = await command.executeToolViaMCP('lookup', {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'packageName parameter must be a string',
        );
      });

      it('should return error for invalid packageName parameter type', async () => {
        const result = await command.executeToolViaMCP('lookup', {
          packageName: 123,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'packageName parameter must be a string',
        );
      });
    });

    describe('search tool', () => {
      it('should successfully search for packages', async () => {
        mockClient.searchPackages.mockResolvedValueOnce(mockSearchResults);

        const result = await command.executeToolViaMCP('search', {
          query: 'lodash',
        });

        expect(mockClient.searchPackages).toHaveBeenCalledWith(
          'lodash',
          undefined,
        );
        expect(result.content[0].text).toContain('"name": "lodash"');
        expect(result.isError).toBeUndefined();
      });

      it('should search with custom limit', async () => {
        mockClient.searchPackages.mockResolvedValueOnce(mockSearchResults);

        const result = await command.executeToolViaMCP('search', {
          query: 'lodash',
          limit: 5,
        });

        expect(mockClient.searchPackages).toHaveBeenCalledWith('lodash', 5);
        expect(result.isError).toBeUndefined();
      });

      it('should return error for missing query parameter', async () => {
        const result = await command.executeToolViaMCP('search', {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'query parameter must be a string',
        );
      });

      it('should return error for invalid limit parameter', async () => {
        const result = await command.executeToolViaMCP('search', {
          query: 'test',
          limit: 'invalid',
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'limit must be a number between 1 and 50',
        );
      });

      it('should return error for out of range limit', async () => {
        const result = await command.executeToolViaMCP('search', {
          query: 'test',
          limit: 100,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'limit must be a number between 1 and 50',
        );
      });
    });

    it('should return error for unknown tool', async () => {
      const result = await command.executeToolViaMCP('unknown', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool: unknown');
    });
  });

  describe('command metadata', () => {
    it('should have correct name and description', () => {
      expect(command.name).toBe('npm');
      expect(command.description).toBe('NPM package lookup and search');
    });
  });
});
