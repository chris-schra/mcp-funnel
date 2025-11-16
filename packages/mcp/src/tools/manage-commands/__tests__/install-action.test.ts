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

  describe('install action', () => {
    it('should install a new command successfully', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      // Mock the installer methods
      const installedCommand = {
        name: 'test-command',
        package: 'test-package',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        description: 'A test command',
      };

      const mockCommand = createMockCommand('test-command', 'A test command');

      mockInstaller.install = vi.fn().mockResolvedValue(installedCommand);
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);

      const result = await tool.handle(
        {
          action: 'install',
          package: 'test-package',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      expect(content.type).toBe('text');

      const response = JSON.parse(content.text);
      expect(response.success).toBe(true);
      expect(response.action).toBe('installed');
      expect(response.message).toContain('Successfully installed command: test-command');
      expect(response.command).toBeDefined();
      expect(response.command.name).toBe('test-command');
      expect(response.hint).toContain('Command installed and hot-reloaded');
    });

    it('should handle already installed command without force', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      // Setup existing command in manifest
      const existingCommand = {
        name: 'existing-command',
        package: 'existing-package',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
      };

      // Mock readManifest to return existing command
      const { readManifest } = await import('@mcp-funnel/commands-core');
      vi.mocked(readManifest).mockResolvedValue({
        commands: [existingCommand],
        updatedAt: new Date().toISOString(),
      });

      // Mock the install method to throw "already installed" error
      mockInstaller.install = vi
        .fn()
        .mockRejectedValue(new Error("Command package 'existing-package' is already installed"));

      const result = await tool.handle(
        {
          action: 'install',
          package: 'existing-package',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.success).toBe(true);
      expect(response.action).toBe('already_installed');
      expect(response.message).toContain('is already installed');
      expect(response.command).toEqual(existingCommand);
    });

    it('should force reinstall when force option is provided', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      const mockCommand = createMockCommand('test-command', 'A test command');
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);

      // Mock successful install with force
      mockInstaller.install = vi.fn().mockResolvedValue({
        name: 'test-command',
        package: 'test-package',
        version: '1.1.0',
        installedAt: new Date().toISOString(),
        description: 'A test command',
      });

      const result = await tool.handle(
        {
          action: 'install',
          package: 'test-package',
          force: true,
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.success).toBe(true);
      expect(response.action).toBe('installed');
    });

    it('should install with specific version', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      const mockCommand = createMockCommand('test-command', 'A test command');
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);

      mockInstaller.install = vi.fn().mockResolvedValue({
        name: 'test-command',
        package: 'test-package',
        version: '2.0.0',
        installedAt: new Date().toISOString(),
        description: 'A test command',
      });

      const result = await tool.handle(
        {
          action: 'install',
          package: 'test-package',
          version: '2.0.0',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.success).toBe(true);
      expect(response.command.version).toBe('2.0.0');
    });

    it('should handle installation errors gracefully', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      mockInstaller.install = vi
        .fn()
        .mockRejectedValue(new Error('npm install failed: network error'));

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

      expect(response.error).toContain('npm install failed: network error');
    });

    it('should handle hot-reload failures gracefully', async () => {
      const { tool, mockContext, mockInstaller } = getContext();

      const mockCommand = createMockCommand('test-command', 'A test command');
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
      mockInstaller.install = vi.fn().mockResolvedValue({
        name: 'test-command',
        package: 'test-package',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        description: 'A test command',
      });

      // Mock hot-reload failure
      mockContext.toolRegistry!.hotReloadCommand = vi.fn().mockImplementation(() => {
        throw new Error('Hot-reload failed');
      });

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

      expect(response.success).toBe(true);
      expect(response.hotReloadError).toBe('Hot-reload failed');
    });
  });
});
