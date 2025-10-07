import { describe, it, expect, vi } from 'vitest';
import { useTestContext, createMockCommand } from './test-utils.js';

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

  describe('update action', () => {
    it('should update command successfully', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      const updatedCommand = {
        name: 'test-command',
        package: 'test-package',
        version: '2.0.0',
        installedAt: new Date().toISOString(),
        description: 'Updated test command',
      };

      const mockCommand = createMockCommand('test-command', 'Updated test command');
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
      mockInstaller.update = vi.fn().mockResolvedValue(updatedCommand);

      const result = await tool.handle(
        {
          action: 'update',
          package: 'test-package',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.success).toBe(true);
      expect(response.action).toBe('updated');
      expect(response.message).toContain(
        'Successfully updated command: test-command to version 2.0.0',
      );
      expect(response.command).toEqual(updatedCommand);
      expect(response.hotReloaded).toBe(true);
    });

    it('should handle update errors', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      mockInstaller.update = vi
        .fn()
        .mockRejectedValue(new Error("Command 'nonexistent' is not installed"));

      const result = await tool.handle(
        {
          action: 'update',
          package: 'nonexistent',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.error).toContain("Command 'nonexistent' is not installed");
    });

    it('should update with hot-reload failure', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      const updatedCommand = {
        name: 'test-command',
        package: 'test-package',
        version: '2.0.0',
        installedAt: new Date().toISOString(),
        description: 'Updated test command',
      };

      mockInstaller.update = vi.fn().mockResolvedValue(updatedCommand);

      // Mock hot-reload to fail
      mockInstaller.loadInstalledCommand = vi
        .fn()
        .mockRejectedValue(new Error('Failed to load updated command'));

      const result = await tool.handle(
        {
          action: 'update',
          package: 'test-package',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.success).toBe(true);
      expect(response.hotReloaded).toBe(false);
      expect(response.hotReloadError).toBe('Failed to load updated command');
    });
  });
});
