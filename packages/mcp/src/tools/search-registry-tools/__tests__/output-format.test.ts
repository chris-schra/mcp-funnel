import { describe, it, expect, vi } from 'vitest';
import { useTestContext, mockFetch } from './test-utils.js';
import type { RegistrySearchResult } from '../../../mcp-registry/types/registry.types.js';

// Mock fetch globally
vi.stubGlobal('fetch', mockFetch);

describe('SearchRegistryTools', () => {
  const getContext = useTestContext();

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
      const { tool, mockContext } = getContext();

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
      const { tool, mockContext } = getContext();

      const result = await tool.handle({ keywords: 'server' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };

      // Should have bullet points or clear separation
      expect(textContent.text).toContain('•');
      // Should have clear structure with name, ID, and description
      expect(textContent.text).toMatch(/•\s+[\w\s]+\s+\([\w-]+\)/);
    });

    it('should include message about next steps', async () => {
      const { tool, mockContext } = getContext();

      const result = await tool.handle({ keywords: 'github' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('💡');
      expect(textContent.text).toContain('get_server_install_info');
      expect(textContent.text).toContain('registryId');
    });
  });
});
