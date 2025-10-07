import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CoreToolContext } from '../../core-tool.interface.js';
import type {
  RegistryServer,
  RegistryInstallInfo,
} from '../../../mcp-registry/types/registry.types.js';
import { GetServerInstallInfo } from '../index.js';
import { createMockContext, createServerSearchResponse } from './test-utils.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GetServerInstallInfo', () => {
  let tool: GetServerInstallInfo;
  let mockContext: CoreToolContext;

  beforeEach(() => {
    tool = new GetServerInstallInfo();
    mockContext = createMockContext();

    // Reset mocks
    vi.clearAllMocks();

    // Default mock implementation
    mockFetch.mockImplementation(async (url: string) => {
      // Handle direct server fetch by ID (UUID pattern)
      if (url.includes('/v0/servers/') && !url.includes('search=')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
        };
      }

      // Handle search endpoint
      if (url.includes('/v0/servers?search=')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            servers: [],
            metadata: {
              count: 0,
              next_cursor: null,
            },
          }),
        };
      }

      throw new Error(`Unmocked fetch request: ${url}`);
    });
  });

  describe('execute - basic functionality', () => {
    it('should fetch server details and return install info', async () => {
      const mockServer: RegistryServer = {
        id: 'test-server-id',
        name: 'test-server-id', // Name matches ID for exact match
        description: 'A test MCP server for unit testing',
        packages: [
          {
            identifier: '@test/mcp-server',
            registry_type: 'npm',
            runtime_hint: 'node',
            package_arguments: ['--port', '3000'],
            environment_variables: [
              { name: 'API_KEY', is_required: true },
              { name: 'DEBUG', value: 'false', is_required: false },
            ],
          },
        ],
        tools: ['test_tool_1', 'test_tool_2'],
      };

      // Mock search to find server by name
      mockFetch.mockImplementationOnce(async (url: string) => {
        if (url.includes('/v0/servers?search=test-server-id')) {
          return createServerSearchResponse([mockServer]);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await tool.handle({ registryId: 'test-server-id' }, mockContext);

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      expect(content.type).toBe('text');

      const installInfo: RegistryInstallInfo = JSON.parse(content.text);
      expect(installInfo.name).toBe('test-server-id');
      expect(installInfo.description).toBe('A test MCP server for unit testing');
      expect(installInfo.configSnippet).toBeDefined();
      expect(installInfo.installInstructions).toBeDefined();
      expect(installInfo.tools).toEqual(['test_tool_1', 'test_tool_2']);
    });

    it('should handle server not found', async () => {
      // Mock fetch to return 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      });

      const result = await tool.handle({ registryId: 'nonexistent-server' }, mockContext);

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      expect(content.text).toContain('Server not found');
      expect(content.text).toContain('nonexistent-server');
    });

    it('should handle missing registryId parameter', async () => {
      const result = await tool.handle({}, mockContext);

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      expect(content.text).toContain('Missing or invalid');
      expect(content.text).toContain('registryId');
    });

    it('should handle invalid registryId parameter', async () => {
      const result = await tool.handle({ registryId: 123 }, mockContext);

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      expect(content.text).toContain('Missing or invalid');
      expect(content.text).toContain('registryId');
    });

    it('should handle registry context errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Registry connection failed'));

      const result = await tool.handle({ registryId: 'test-server' }, mockContext);

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      // The RegistryContext handles errors gracefully and returns null for server not found
      expect(content.text).toContain('Server not found: test-server');
    });
  });
});
