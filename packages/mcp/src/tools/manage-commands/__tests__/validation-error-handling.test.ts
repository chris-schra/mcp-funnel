import { describe, it, expect, vi } from 'vitest';
import { useTestContext } from './test-utils.js';

// Mock readManifest
vi.mock('@mcp-funnel/commands-core', async () => {
  const actual = await vi.importActual('@mcp-funnel/commands-core');
  return {
    ...actual,
    readManifest: vi.fn(),
  };
});

describe('ManageCommands', () => {
  const getContext = useTestContext();

  describe('validation and error handling', () => {
    it('should handle unknown action', async () => {
      const { tool, mockContext } = getContext();

      const result = await tool.handle(
        {
          action: 'unknown-action',
          package: 'test-package',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.error).toContain('Unknown action: unknown-action');
    });

    it('should handle missing package parameter', async () => {
      const { tool, mockContext } = getContext();

      const result = await tool.handle(
        {
          action: 'install',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.error).toBe('Missing required parameter: package');
    });

    it('should handle installer initialization errors', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      // Mock installer to throw during operation
      mockInstaller.install = vi
        .fn()
        .mockRejectedValue(
          new Error('Failed to initialize installer directory'),
        );

      const result = await tool.handle(
        {
          action: 'install',
          package: 'test-package',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.error).toContain(
        'Failed to initialize installer directory',
      );
    });
  });
});