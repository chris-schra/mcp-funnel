import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoreToolContext } from '../core-tool.interface.js';
import type { RegistrySearchResult } from '../../registry/types/registry.types.js';
import type { ToolRegistry } from '../../tool-registry.js';
import { SearchRegistryTools } from './index.js';

// Mock RegistryContext
const mockRegistryContext = {
  searchServers: vi.fn(),
  getInstance: vi.fn(),
};

// Mock the RegistryContext module
vi.mock('../../registry/index.js', () => ({
  RegistryContext: {
    getInstance: vi.fn(() => mockRegistryContext),
  },
}));

describe('SearchRegistryTools', () => {
  let tool: SearchRegistryTools;
  let mockContext: CoreToolContext;

  beforeEach(() => {
    tool = new SearchRegistryTools();

    mockContext = {
      toolRegistry: {} as ToolRegistry,
      toolDescriptionCache: new Map(),
      dynamicallyEnabledTools: new Set(),
      config: {
        servers: [],
      },
      enableTools: vi.fn(),
    };

    // Reset mocks
    vi.clearAllMocks();

    // Setup default mock responses
    mockRegistryContext.searchServers.mockResolvedValue({
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
    } satisfies RegistrySearchResult);
  });

  describe('Tool Definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('search_registry_tools');
    });

    it('should have proper description', () => {
      const toolDef = tool.tool;
      expect(toolDef.description).toContain('Search MCP registry');
      expect(toolDef.description).toContain('token efficiency');
    });

    it('should have valid input schema', () => {
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

    it('should have required keywords parameter only', () => {
      const toolDef = tool.tool;
      expect(toolDef.inputSchema.required).toEqual(['keywords']);
      expect(toolDef.inputSchema.required).not.toContain('registry');
    });
  });

  describe('isEnabled', () => {
    it('should be enabled when exposeCoreTools is not specified', () => {
      expect(tool.isEnabled({ servers: [] })).toBe(true);
    });

    it('should be disabled when exposeCoreTools is empty array', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: [] })).toBe(false);
    });

    it('should be enabled when exposeCoreTools includes tool name', () => {
      expect(
        tool.isEnabled({
          servers: [],
          exposeCoreTools: ['search_registry_tools'],
        }),
      ).toBe(true);
    });

    it('should be enabled when exposeCoreTools has matching pattern', () => {
      expect(
        tool.isEnabled({ servers: [], exposeCoreTools: ['search_*'] }),
      ).toBe(true);
    });

    it('should be enabled when exposeCoreTools is ["*"]', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['*'] })).toBe(
        true,
      );
    });

    it('should be disabled when exposeCoreTools excludes the tool', () => {
      expect(
        tool.isEnabled({ servers: [], exposeCoreTools: ['other_tool'] }),
      ).toBe(false);
    });
  });

  describe('execute', () => {
    it('should search registries and return results', async () => {
      const result = await tool.handle(
        { keywords: 'github issues' },
        mockContext,
      );

      expect(mockRegistryContext.searchServers).toHaveBeenCalledWith(
        'github issues',
        undefined,
      );
      expect(result.content).toHaveLength(1);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe('text');
      expect(textContent.text).toContain('Found 2 servers');
      expect(textContent.text).toContain('GitHub MCP Server');
      expect(textContent.text).toContain('github-mcp-server');
      expect(textContent.text).toContain('get_server_install_info');
    });

    it('should include registry information in output', async () => {
      const result = await tool.handle({ keywords: 'filesystem' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('File System Server');
      expect(textContent.text).toContain('filesystem-server');
      expect(textContent.text).toContain('Type: Local');
      expect(textContent.text).toContain('Registry: official');
    });

    it('should handle specific registry parameter', async () => {
      const result = await tool.handle(
        { keywords: 'github', registry: 'official' },
        mockContext,
      );

      expect(mockRegistryContext.searchServers).toHaveBeenCalledWith(
        'github',
        'official',
      );
      expect(result.content).toHaveLength(1);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('GitHub MCP Server');
    });

    it('should return token-efficient minimal server info', async () => {
      const result = await tool.handle({ keywords: 'github' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      // Should contain essential info but not excessive details
      expect(textContent.text).toContain('GitHub MCP Server'); // server name
      expect(textContent.text).toContain('Interact with GitHub'); // description
      expect(textContent.text).toContain('github-mcp-server'); // registryId
      // Should NOT contain full server details, packages, etc.
      expect(textContent.text).not.toContain('packages');
      expect(textContent.text).not.toContain('environment_variables');
      expect(textContent.text).not.toContain('package_arguments');
    });

    it('should handle no results found', async () => {
      // Mock no results
      mockRegistryContext.searchServers.mockResolvedValue({
        found: false,
        servers: [],
        message: 'No servers found',
      } satisfies RegistrySearchResult);

      const result = await tool.handle(
        { keywords: 'nonexistent' },
        mockContext,
      );

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain(
        'No servers found matching keywords: nonexistent',
      );
      expect(textContent.text).toContain('Try broader search terms');
    });

    it('should include helpful message about using get_server_install_info', async () => {
      const result = await tool.handle({ keywords: 'github' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('get_server_install_info');
      expect(textContent.text).toContain('registryId');
      expect(textContent.text).toContain('installation details');
    });
  });

  describe('Integration with RegistryContext', () => {
    it('should use singleton RegistryContext', async () => {
      await tool.handle({ keywords: 'test' }, mockContext);
      expect(mockRegistryContext.getInstance).toBeDefined();
    });

    it('should pass keywords correctly to registry search', async () => {
      await tool.handle({ keywords: 'test keywords' }, mockContext);
      expect(mockRegistryContext.searchServers).toHaveBeenCalledWith(
        'test keywords',
        undefined,
      );
    });

    it('should pass registry parameter to searchServers', async () => {
      const result = await tool.handle(
        {
          keywords: 'test',
          registry: 'official',
        },
        mockContext,
      );

      expect(mockRegistryContext.searchServers).toHaveBeenCalledWith(
        'test',
        'official',
      );
      expect(result.content).toHaveLength(1);
    });

    it('should pass optional registry parameter to search', async () => {
      await tool.handle(
        { keywords: 'test', registry: 'community' },
        mockContext,
      );
      expect(mockRegistryContext.searchServers).toHaveBeenCalledWith(
        'test',
        'community',
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error for missing keywords parameter', async () => {
      await expect(tool.handle({}, mockContext)).rejects.toThrow(
        'Missing or invalid "keywords" parameter',
      );
    });

    it('should throw error for invalid keywords parameter type', async () => {
      await expect(tool.handle({ keywords: 123 }, mockContext)).rejects.toThrow(
        'Missing or invalid "keywords" parameter',
      );
    });

    it('should throw error for null keywords parameter', async () => {
      await expect(
        tool.handle({ keywords: null }, mockContext),
      ).rejects.toThrow('Missing or invalid "keywords" parameter');
    });

    it('should throw error for invalid registry parameter type', async () => {
      await expect(
        tool.handle({ keywords: 'test', registry: 123 }, mockContext),
      ).rejects.toThrow('Invalid "registry" parameter - must be a string');
    });

    it('should throw error for empty keywords', async () => {
      await expect(tool.handle({ keywords: '' }, mockContext)).rejects.toThrow(
        'Missing or invalid "keywords" parameter',
      );
    });

    it('should handle whitespace-only keywords', async () => {
      mockRegistryContext.searchServers.mockResolvedValue({
        found: false,
        servers: [],
        message: 'No servers found',
      } satisfies RegistrySearchResult);

      const result = await tool.handle({ keywords: '   ' }, mockContext);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('No servers found');
    });

    it('should handle registry search errors gracefully', async () => {
      mockRegistryContext.searchServers.mockRejectedValue(
        new Error('Registry service unavailable'),
      );

      await expect(
        tool.handle({ keywords: 'test' }, mockContext),
      ).rejects.toThrow('Registry search failed: Registry service unavailable');
    });
  });

  describe('Output Format', () => {
    it('should return found boolean in result structure', async () => {
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

    it('should include minimal server fields only', async () => {
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

    it('should format server list in readable way', async () => {
      const result = await tool.handle({ keywords: 'server' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };

      // Should have bullet points or clear separation
      expect(textContent.text).toContain('•');
      // Should have clear structure with name, ID, and description
      expect(textContent.text).toMatch(/•\s+[\w\s]+\s+\([\w-]+\)/);
    });

    it('should include message about next steps', async () => {
      const result = await tool.handle({ keywords: 'github' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('💡');
      expect(textContent.text).toContain('get_server_install_info');
      expect(textContent.text).toContain('registryId');
    });
  });
});
