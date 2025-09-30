import { describe, it, expect, vi } from 'vitest';
import { useTestContext, mockFetch } from './test-utils.js';

// Mock fetch globally
vi.stubGlobal('fetch', mockFetch);

describe('SearchRegistryTools', () => {
  const getContext = useTestContext();

  describe('Integration with Real RegistryContext', () => {
    it('should make HTTP request to search endpoint', async () => {
      const { tool, mockContext } = getContext();

      await tool.handle({ keywords: 'test' }, mockContext);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v0/servers?search=test'),
        expect.objectContaining({
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('should encode keywords correctly in URL', async () => {
      const { tool, mockContext } = getContext();

      await tool.handle({ keywords: 'test keywords' }, mockContext);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v0/servers?search=test%20keywords'),
        expect.any(Object),
      );
    });

    it('should still work with registry parameter', async () => {
      const { tool, mockContext } = getContext();

      const result = await tool.handle(
        {
          keywords: 'test',
          registry: 'modelcontextprotocol',
        },
        mockContext,
      );

      // Should make HTTP call when registry matches default URL
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v0/servers?search=test'),
        expect.any(Object),
      );
      expect(result.content).toHaveLength(1);
    });

    it('should handle registry filter that does not match', async () => {
      const { tool, mockContext } = getContext();

      // Test registry filter that won't match the default URL
      const result = await tool.handle(
        { keywords: 'test', registry: 'nonexistent' },
        mockContext,
      );

      // No HTTP call should be made since no registries match the filter
      expect(mockFetch).not.toHaveBeenCalled();

      const textContent = result.content[0] as { type: string; text: string };
      // The tool returns a "no servers found" message when no registries match
      expect(textContent.text).toContain(
        'No servers found matching keywords: test in registry: nonexistent',
      );
    });
  });
});