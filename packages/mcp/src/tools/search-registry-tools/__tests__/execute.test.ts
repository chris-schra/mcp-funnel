import { describe, it, expect, vi } from 'vitest';
import { useTestContext, mockFetch } from './test-utils.js';

// Mock fetch globally
vi.stubGlobal('fetch', mockFetch);

describe('SearchRegistryTools', () => {
  const getContext = useTestContext();

  describe('execute', () => {
    it('should search registries and return results', async () => {
      const { tool, mockContext } = getContext();

      const result = await tool.handle(
        { keywords: 'github issues' },
        mockContext,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v0/servers?search=github%20issues'),
        expect.objectContaining({
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }),
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
      const { tool, mockContext } = getContext();

      const result = await tool.handle({ keywords: 'filesystem' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('File System Server');
      expect(textContent.text).toContain('filesystem-server');
      expect(textContent.text).toContain('Type: Local');
      expect(textContent.text).toContain('Registry: official');
    });

    it('should handle specific registry parameter', async () => {
      const { tool, mockContext } = getContext();

      // Use registry URL substring that will match the default registry
      const result = await tool.handle(
        { keywords: 'github', registry: 'modelcontextprotocol' },
        mockContext,
      );

      // Registry filtering happens in RegistryContext, HTTP call should be made
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v0/servers?search=github'),
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result.content).toHaveLength(1);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('GitHub MCP Server');
    });

    it('should return token-efficient minimal server info', async () => {
      const { tool, mockContext } = getContext();

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
      const { tool, mockContext } = getContext();

      // Mock no results
      mockFetch.mockResolvedValueOnce({
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
      });

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
      const { tool, mockContext } = getContext();

      const result = await tool.handle({ keywords: 'github' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('get_server_install_info');
      expect(textContent.text).toContain('registryId');
      expect(textContent.text).toContain('installation details');
    });
  });
});
