import { describe, it, expect, vi } from 'vitest';
import { useTestContext, mockFetch } from './test-utils.js';

// Mock fetch globally
vi.stubGlobal('fetch', mockFetch);

describe('SearchRegistryTools', () => {
  const getContext = useTestContext();

  describe('Error Handling', () => {
    it('should throw error for missing keywords parameter', async () => {
      const { tool, mockContext } = getContext();

      await expect(tool.handle({}, mockContext)).rejects.toThrow(
        'Missing or invalid "keywords" parameter',
      );
    });

    it('should throw error for invalid keywords parameter type', async () => {
      const { tool, mockContext } = getContext();

      await expect(tool.handle({ keywords: 123 }, mockContext)).rejects.toThrow(
        'Missing or invalid "keywords" parameter',
      );
    });

    it('should throw error for null keywords parameter', async () => {
      const { tool, mockContext } = getContext();

      await expect(
        tool.handle({ keywords: null }, mockContext),
      ).rejects.toThrow('Missing or invalid "keywords" parameter');
    });

    it('should throw error for invalid registry parameter type', async () => {
      const { tool, mockContext } = getContext();

      await expect(
        tool.handle({ keywords: 'test', registry: 123 }, mockContext),
      ).rejects.toThrow('Invalid "registry" parameter - must be a string');
    });

    it('should throw error for empty keywords', async () => {
      const { tool, mockContext } = getContext();

      await expect(tool.handle({ keywords: '' }, mockContext)).rejects.toThrow(
        'Missing or invalid "keywords" parameter',
      );
    });

    it('should handle whitespace-only keywords', async () => {
      const { tool, mockContext } = getContext();

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

      const result = await tool.handle({ keywords: '   ' }, mockContext);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('No servers found');
    });

    it('should handle registry search errors gracefully', async () => {
      const { tool, mockContext } = getContext();

      // Mock HTTP error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      });

      // RegistryContext handles errors gracefully and returns empty results
      const result = await tool.handle({ keywords: 'test' }, mockContext);

      expect(result.content).toHaveLength(1);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain(
        'No servers found matching keywords: test',
      );
    });
  });
});
