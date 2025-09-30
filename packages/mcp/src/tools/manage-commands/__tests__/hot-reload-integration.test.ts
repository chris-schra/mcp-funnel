import { describe, it, expect, vi } from 'vitest';
import { useTestContext, createMockCommand } from './test-utils.js';
import type { CoreToolContext } from '../../core-tool.interface.js';

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

  describe('hot reload integration', () => {
    it('should attempt hot reload after successful install', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      const mockCommand = createMockCommand('test-command', 'A test command');
      mockInstaller.loadInstalledCommand = vi
        .fn()
        .mockResolvedValue(mockCommand);
      mockInstaller.install = vi.fn().mockResolvedValue({
        name: 'test-command',
        package: 'test-package',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        description: 'A test command',
      });

      await tool.handle(
        {
          action: 'install',
          package: 'test-package',
        },
        mockContext,
      );

      expect(mockContext.toolRegistry!.hotReloadCommand).toHaveBeenCalledWith(
        mockCommand,
      );
      expect(mockContext.toolRegistry!.getAllTools).toHaveBeenCalled();
    });

    it('should attempt hot reload after successful update', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      const mockCommand = createMockCommand(
        'test-command',
        'Updated test command',
      );
      mockInstaller.loadInstalledCommand = vi
        .fn()
        .mockResolvedValue(mockCommand);
      mockInstaller.update = vi.fn().mockResolvedValue({
        name: 'test-command',
        package: 'test-package',
        version: '2.0.0',
        installedAt: new Date().toISOString(),
        description: 'Updated test command',
      });

      await tool.handle(
        {
          action: 'update',
          package: 'test-package',
        },
        mockContext,
      );

      expect(mockContext.toolRegistry!.hotReloadCommand).toHaveBeenCalledWith(
        mockCommand,
      );
    });

    it('should handle missing tool registry gracefully', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      const contextWithoutRegistry = {
        ...mockContext,
        toolRegistry: undefined,
      } as Partial<CoreToolContext>;

      const mockCommand = createMockCommand('test-command', 'A test command');
      mockInstaller.loadInstalledCommand = vi
        .fn()
        .mockResolvedValue(mockCommand);
      mockInstaller.install = vi.fn().mockResolvedValue({
        name: 'test-command',
        package: 'test-package',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        description: 'A test command',
      });

      const result = await tool.handle(
        {
          action: 'install',
          package: 'test-package',
        },
        contextWithoutRegistry as CoreToolContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.success).toBe(true);
      // Should still succeed even without tool registry
    });
  });
});
