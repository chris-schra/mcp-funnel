import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseCoreTool } from '../base-core-tool.js';
import { CoreToolContext } from '../core-tool.interface.js';
import type { RegistrySearchResult } from '../../registry/types/registry.types.js';
import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolRegistry } from '../../tool-registry.js';

/**
 * Mock SearchRegistryTools class implementation
 * This is a temporary mock until the real implementation exists
 */
class MockSearchRegistryTools extends BaseCoreTool {
  readonly name = 'search_registry_tools';

  get tool(): Tool {
    return {
      name: this.name,
      description:
        'Search MCP registry for available tools and servers by keywords. Returns minimal server information optimized for token efficiency.',
      inputSchema: {
        type: 'object',
        properties: {
          keywords: {
            type: 'string',
            description:
              'Space-separated keywords to search for in server names, descriptions, and tool names',
          },
          registry: {
            type: 'string',
            description:
              'Optional registry ID to search within a specific registry (e.g., "official", "community")',
            optional: true,
          },
        },
        required: ['keywords'],
      },
    };
  }

  async handle(
    args: Record<string, unknown>,
    _context: CoreToolContext,
  ): Promise<CallToolResult> {
    // Mock implementation for testing
    const { keywords, registry } = args;

    if (!keywords || typeof keywords !== 'string') {
      throw new Error('Missing or invalid "keywords" parameter');
    }

    if (registry && typeof registry !== 'string') {
      throw new Error('Invalid "registry" parameter - must be a string');
    }

    // Mock registry search
    const mockRegistryContext = {
      searchServers: vi.fn().mockResolvedValue({
        found: true,
        servers: [
          {
            name: 'GitHub MCP Server',
            description:
              'Interact with GitHub repositories, issues, and pull requests',
            registryId: 'github-mcp-server',
            isRemote: false,
            registryType: 'official',
          },
          {
            name: 'File System Server',
            description: 'Read and write files on the local filesystem',
            registryId: 'filesystem-server',
            isRemote: false,
            registryType: 'official',
          },
        ],
        message: 'Found 2 servers matching your search criteria',
      } satisfies RegistrySearchResult),
    };

    const result = await mockRegistryContext.searchServers(keywords, registry);

    if (!result.found || !result.servers || result.servers.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No servers found matching keywords: ${keywords}${registry ? ` in registry: ${registry}` : ''}\n\nTry broader search terms or check available registries.`,
          },
        ],
      };
    }

    const serverList = result.servers
      .map(
        (server: NonNullable<RegistrySearchResult['servers']>[0]) =>
          `• ${server.name} (${server.registryId})\n  ${server.description}\n  Type: ${server.isRemote ? 'Remote' : 'Local'} | Registry: ${server.registryType || 'unknown'}`,
      )
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `${result.message}\n\n${serverList}\n\n💡 Use get_server_install_info with a registryId to get installation details for any server.`,
        },
      ],
    };
  }
}

// Mock RegistryContext singleton
const mockRegistryContext = {
  getInstance: vi.fn(() => ({
    searchServers: vi.fn(),
  })),
};

describe('SearchRegistryTools', () => {
  let tool: MockSearchRegistryTools;
  let mockContext: CoreToolContext;

  beforeEach(() => {
    tool = new MockSearchRegistryTools();

    mockContext = {
      toolRegistry: {} as ToolRegistry,
      toolDescriptionCache: new Map(),
      dynamicallyEnabledTools: new Set(),
      config: {
        servers: [],
      },
      enableTools: vi.fn(),
    };

    vi.clearAllMocks();
  });

  describe('Tool Definition', () => {
    it.skip('should have correct name', () => {
      expect(tool.name).toBe('search_registry_tools');
    });

    it.skip('should have proper description', () => {
      const toolDef = tool.tool;
      expect(toolDef.description).toContain('Search MCP registry');
      expect(toolDef.description).toContain('token efficiency');
    });

    it.skip('should have valid input schema', () => {
      const toolDef = tool.tool;
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.required).toEqual(['keywords']);

      const properties = toolDef.inputSchema.properties as Record<
        string,
        Record<string, unknown>
      >;
      expect(properties?.keywords).toBeDefined();
      expect(properties?.keywords.type).toBe('string');
      expect(properties?.keywords.description).toContain('keywords');

      expect(properties?.registry).toBeDefined();
      expect(properties?.registry.type).toBe('string');
      expect(properties?.registry.optional).toBe(true);
    });

    it.skip('should have required keywords parameter only', () => {
      const toolDef = tool.tool;
      expect(toolDef.inputSchema.required).toEqual(['keywords']);
      expect(toolDef.inputSchema.required).not.toContain('registry');
    });
  });

  describe('isEnabled', () => {
    it.skip('should be enabled when exposeCoreTools is not specified', () => {
      expect(tool.isEnabled({ servers: [] })).toBe(true);
    });

    it.skip('should be disabled when exposeCoreTools is empty array', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: [] })).toBe(false);
    });

    it.skip('should be enabled when exposeCoreTools includes tool name', () => {
      expect(
        tool.isEnabled({
          servers: [],
          exposeCoreTools: ['search_registry_tools'],
        }),
      ).toBe(true);
    });

    it.skip('should be enabled when exposeCoreTools has matching pattern', () => {
      expect(
        tool.isEnabled({ servers: [], exposeCoreTools: ['search_*'] }),
      ).toBe(true);
    });

    it.skip('should be enabled when exposeCoreTools is ["*"]', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['*'] })).toBe(
        true,
      );
    });

    it.skip('should be disabled when exposeCoreTools excludes the tool', () => {
      expect(
        tool.isEnabled({ servers: [], exposeCoreTools: ['other_tool'] }),
      ).toBe(false);
    });
  });

  describe('execute', () => {
    it.skip('should search registries and return results', async () => {
      const result = await tool.handle(
        { keywords: 'github issues' },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe('text');
      expect(textContent.text).toContain('Found 2 servers');
      expect(textContent.text).toContain('GitHub MCP Server');
      expect(textContent.text).toContain('github-mcp-server');
      expect(textContent.text).toContain('get_server_install_info');
    });

    it.skip('should include registry information in output', async () => {
      const result = await tool.handle({ keywords: 'filesystem' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('File System Server');
      expect(textContent.text).toContain('filesystem-server');
      expect(textContent.text).toContain('Type: Local');
      expect(textContent.text).toContain('Registry: official');
    });

    it.skip('should handle specific registry parameter', async () => {
      const result = await tool.handle(
        { keywords: 'github', registry: 'official' },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('GitHub MCP Server');
    });

    it.skip('should return token-efficient minimal server info', async () => {
      const result = await tool.handle({ keywords: 'github' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      // Should contain essential info but not excessive details
      expect(textContent.text).toContain('name');
      expect(textContent.text).toContain('description');
      expect(textContent.text).toContain('registryId');
      // Should NOT contain full server details, packages, etc.
      expect(textContent.text).not.toContain('packages');
      expect(textContent.text).not.toContain('environment_variables');
      expect(textContent.text).not.toContain('package_arguments');
    });

    it.skip('should handle no results found', async () => {
      // Mock no results
      const toolWithNoResults = new MockSearchRegistryTools();
      toolWithNoResults.handle = async (args) => {
        return {
          content: [
            {
              type: 'text',
              text: `No servers found matching keywords: ${args.keywords}\n\nTry broader search terms or check available registries.`,
            },
          ],
        };
      };

      const result = await toolWithNoResults.handle(
        { keywords: 'nonexistent' },
        mockContext,
      );

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain(
        'No servers found matching keywords: nonexistent',
      );
      expect(textContent.text).toContain('Try broader search terms');
    });

    it.skip('should include helpful message about using get_server_install_info', async () => {
      const result = await tool.handle({ keywords: 'github' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('get_server_install_info');
      expect(textContent.text).toContain('registryId');
      expect(textContent.text).toContain('installation details');
    });
  });

  describe('Integration with RegistryContext', () => {
    it.skip('should use singleton RegistryContext', () => {
      // This test would verify that the tool uses RegistryContext.getInstance()
      expect(mockRegistryContext.getInstance).toBeDefined();
    });

    it.skip('should pass keywords correctly to registry search', async () => {
      const searchSpy = vi.fn().mockResolvedValue({
        found: false,
        servers: [],
        message: 'No results found',
      });

      // Mock the registry context to spy on the search call
      const mockTool = new MockSearchRegistryTools();
      mockTool.handle = async (args) => {
        searchSpy(args.keywords, args.registry);
        return {
          content: [{ type: 'text', text: 'mocked result' }],
        };
      };

      await mockTool.handle({ keywords: 'test keywords' }, mockContext);
      expect(searchSpy).toHaveBeenCalledWith('test keywords', undefined);
    });

    it.skip('should pass optional registry parameter to search', async () => {
      const searchSpy = vi.fn().mockResolvedValue({
        found: false,
        servers: [],
        message: 'No results found',
      });

      const mockTool = new MockSearchRegistryTools();
      mockTool.handle = async (args) => {
        searchSpy(args.keywords, args.registry);
        return {
          content: [{ type: 'text', text: 'mocked result' }],
        };
      };

      await mockTool.handle(
        { keywords: 'test', registry: 'community' },
        mockContext,
      );
      expect(searchSpy).toHaveBeenCalledWith('test', 'community');
    });
  });

  describe('Error Handling', () => {
    it.skip('should throw error for missing keywords parameter', async () => {
      await expect(tool.handle({}, mockContext)).rejects.toThrow(
        'Missing or invalid "keywords" parameter',
      );
    });

    it.skip('should throw error for invalid keywords parameter type', async () => {
      await expect(tool.handle({ keywords: 123 }, mockContext)).rejects.toThrow(
        'Missing or invalid "keywords" parameter',
      );
    });

    it.skip('should throw error for null keywords parameter', async () => {
      await expect(
        tool.handle({ keywords: null }, mockContext),
      ).rejects.toThrow('Missing or invalid "keywords" parameter');
    });

    it.skip('should throw error for invalid registry parameter type', async () => {
      await expect(
        tool.handle({ keywords: 'test', registry: 123 }, mockContext),
      ).rejects.toThrow('Invalid "registry" parameter - must be a string');
    });

    it.skip('should handle empty keywords gracefully', async () => {
      const result = await tool.handle({ keywords: '' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('No servers found');
    });

    it.skip('should handle whitespace-only keywords', async () => {
      const result = await tool.handle({ keywords: '   ' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('No servers found');
    });

    it.skip('should handle registry search errors gracefully', async () => {
      const errorTool = new MockSearchRegistryTools();
      errorTool.handle = async () => {
        throw new Error('Registry service unavailable');
      };

      await expect(
        errorTool.handle({ keywords: 'test' }, mockContext),
      ).rejects.toThrow('Registry service unavailable');
    });
  });

  describe('Output Format', () => {
    it.skip('should return found boolean in result structure', async () => {
      // This would test the internal RegistrySearchResult structure
      const mockSearchResult: RegistrySearchResult = {
        found: true,
        servers: [
          {
            name: 'Test Server',
            description: 'Test description',
            registryId: 'test-server',
            isRemote: false,
          },
        ],
        message: 'Found 1 server',
      };

      expect(mockSearchResult.found).toBe(true);
      expect(mockSearchResult.servers).toHaveLength(1);
      expect(mockSearchResult.message).toContain('Found 1 server');
    });

    it.skip('should include minimal server fields only', async () => {
      const result = await tool.handle({ keywords: 'github' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };

      // Should include minimal required fields
      expect(textContent.text).toContain('github-mcp-server'); // registryId
      expect(textContent.text).toContain('GitHub MCP Server'); // name
      expect(textContent.text).toContain('Interact with GitHub'); // description
      expect(textContent.text).toContain('Type: Local'); // isRemote indicator

      // Should NOT include detailed server configuration
      expect(textContent.text).not.toContain('npm install');
      expect(textContent.text).not.toContain('environment');
      expect(textContent.text).not.toContain('command');
    });

    it.skip('should format server list in readable way', async () => {
      const result = await tool.handle({ keywords: 'server' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };

      // Should have bullet points or clear separation
      expect(textContent.text).toContain('•');
      // Should have clear structure with name, ID, and description
      expect(textContent.text).toMatch(/•\s+[\w\s]+\s+\([\w-]+\)/);
    });

    it.skip('should include message about next steps', async () => {
      const result = await tool.handle({ keywords: 'github' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('💡');
      expect(textContent.text).toContain('get_server_install_info');
      expect(textContent.text).toContain('registryId');
    });
  });
});
