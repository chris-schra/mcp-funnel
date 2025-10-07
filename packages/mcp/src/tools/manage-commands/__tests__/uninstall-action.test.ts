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

  describe('uninstall action', () => {
    it('should uninstall command successfully', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      mockInstaller.uninstall = vi.fn().mockResolvedValue(undefined);

      const result = await tool.handle(
        {
          action: 'uninstall',
          package: 'test-package',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.success).toBe(true);
      expect(response.action).toBe('uninstalled');
      expect(response.message).toContain('Successfully uninstalled command: test-package');
      expect(response.note).toContain('Tools will be removed when the session restarts');
    });

    it('should uninstall with removeData option', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      mockInstaller.uninstall = vi.fn().mockResolvedValue(undefined);

      const result = await tool.handle(
        {
          action: 'uninstall',
          package: 'test-package',
          removeData: true,
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.success).toBe(true);
      expect(mockInstaller.uninstall).toHaveBeenCalledWith('test-package', {
        removeData: true,
      });
    });

    it('should handle uninstall errors', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      mockInstaller.uninstall = vi
        .fn()
        .mockRejectedValue(new Error("Command 'nonexistent' is not installed"));

      const result = await tool.handle(
        {
          action: 'uninstall',
          package: 'nonexistent',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.error).toContain("Command 'nonexistent' is not installed");
    });
  });
});
