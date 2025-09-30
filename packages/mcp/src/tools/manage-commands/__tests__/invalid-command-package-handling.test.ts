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

  describe('invalid command package handling', () => {
    it('should handle package that does not export valid command', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      // Mock loadInstalledCommand to return null (invalid command)
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(null);

      // Mock install to throw the expected error for invalid commands
      mockInstaller.install = vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Package 'invalid-package' does not export a valid MCP Funnel command",
          ),
        );

      const result = await tool.handle(
        {
          action: 'install',
          package: 'invalid-package',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.error).toContain(
        'does not export a valid MCP Funnel command',
      );
    });
  });
});
