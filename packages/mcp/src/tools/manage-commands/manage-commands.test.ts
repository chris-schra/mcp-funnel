import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ManageCommands } from './index.js';
import { CommandInstaller } from '@mcp-funnel/commands-core';
import type { CoreToolContext } from '../core-tool.interface.js';
import type { ICommand } from '@mcp-funnel/commands-core';

// Create a mock command that implements ICommand interface
const createMockCommand = (name: string, description: string): ICommand => ({
  name,
  description,
  executeToolViaMCP: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'mock result' }],
  }),
  executeViaCLI: vi.fn().mockResolvedValue(undefined),
  getMCPDefinitions: vi.fn().mockReturnValue([
    {
      name: `${name}_tool`,
      description: `Tool from ${name}`,
      inputSchema: { type: 'object', properties: {} },
    },
  ]),
});

describe('ManageCommands', () => {
  let tool: ManageCommands;
  let mockContext: CoreToolContext;
  let testDir: string;
  let mockInstaller: CommandInstaller;

  beforeEach(async () => {
    // Create temporary directory for testing
    testDir = await fs.mkdtemp(join(tmpdir(), 'manage-commands-test-'));

    // Create a mock tool registry with hot-reload capability
    const mockToolRegistry = {
      hotReloadCommand: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([
        {
          fullName: 'test-command__test_tool',
          command: { name: 'test-command' },
          discovered: true,
        },
      ]),
    };

    mockContext = {
      toolRegistry: mockToolRegistry as any,
      toolDescriptionCache: new Map(),
      dynamicallyEnabledTools: new Set(),
      config: {
        servers: [],
      },
      configPath: './.mcp-funnel.json',
      enableTools: vi.fn(),
    };

    // Create tool and mock the installer completely
    tool = new ManageCommands();
    mockInstaller = {
      install: vi.fn(),
      uninstall: vi.fn(),
      update: vi.fn(),
      readManifest: vi.fn(),
      loadInstalledCommand: vi.fn(),
    } as any;

    (tool as any).installer = mockInstaller;

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('Tool Definition', () => {
    it('should have correct name and schema', () => {
      expect(tool.name).toBe('manage_commands');

      const toolDef = tool.tool;
      expect(toolDef.name).toBe('manage_commands');
      expect(toolDef.description).toContain('Manage MCP Funnel commands');
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.required).toEqual(['action', 'package']);

      const properties = toolDef.inputSchema.properties as Record<
        string,
        { type: string; enum?: string[]; description: string; default?: any }
      >;

      expect(properties.action).toBeDefined();
      expect(properties.action.type).toBe('string');
      expect(properties.action.enum).toEqual(['install', 'uninstall', 'update']);

      expect(properties.package).toBeDefined();
      expect(properties.package.type).toBe('string');
      expect(properties.package.description).toContain('NPM package name');

      expect(properties.version).toBeDefined();
      expect(properties.version.description).toContain('Specific version to install');

      expect(properties.force).toBeDefined();
      expect(properties.force.type).toBe('boolean');
      expect(properties.force.default).toBe(false);

      expect(properties.removeData).toBeDefined();
      expect(properties.removeData.type).toBe('boolean');
      expect(properties.removeData.default).toBe(false);
    });
  });

  describe('install action', () => {
    it('should install a new command successfully', async () => {
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
      // Setup existing command in manifest
      const existingCommand = {
        name: 'existing-command',
        package: 'existing-package',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
      };

      // Mock readManifest to return existing command
      mockInstaller.readManifest = vi.fn().mockResolvedValue({
        commands: [existingCommand],
        updatedAt: new Date().toISOString(),
      });

      // Mock the install method to throw "already installed" error
      mockInstaller.install = vi.fn().mockRejectedValue(
        new Error('Command package \'existing-package\' is already installed'),
      );

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
      mockInstaller.install = vi.fn().mockRejectedValue(
        new Error('npm install failed: network error'),
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

      expect(response.error).toContain('npm install failed: network error');
    });

    it('should handle hot-reload failures gracefully', async () => {
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

  describe('uninstall action', () => {
    it('should uninstall command successfully', async () => {
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
      mockInstaller.uninstall = vi.fn().mockRejectedValue(
        new Error('Command \'nonexistent\' is not installed'),
      );

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

      expect(response.error).toContain('Command \'nonexistent\' is not installed');
    });
  });

  describe('update action', () => {
    it('should update command successfully', async () => {
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
      expect(response.message).toContain('Successfully updated command: test-command to version 2.0.0');
      expect(response.command).toEqual(updatedCommand);
      expect(response.hotReloaded).toBe(true);
    });

    it('should handle update errors', async () => {
      mockInstaller.update = vi.fn().mockRejectedValue(
        new Error('Command \'nonexistent\' is not installed'),
      );

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

      expect(response.error).toContain('Command \'nonexistent\' is not installed');
    });

    it('should update with hot-reload failure', async () => {
      const updatedCommand = {
        name: 'test-command',
        package: 'test-package',
        version: '2.0.0',
        installedAt: new Date().toISOString(),
        description: 'Updated test command',
      };

      mockInstaller.update = vi.fn().mockResolvedValue(updatedCommand);

      // Mock hot-reload to fail
      mockInstaller.loadInstalledCommand = vi.fn().mockRejectedValue(
        new Error('Failed to load updated command'),
      );

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

  describe('validation and error handling', () => {
    it('should handle unknown action', async () => {
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
      const result = await tool.handle(
        {
          action: 'install',
        },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      // Should work since package is undefined, but installer will handle validation
      expect(content.text).toBeDefined();
    });

    it('should handle installer initialization errors', async () => {
      // Mock installer to throw during operation
      mockInstaller.install = vi.fn().mockRejectedValue(
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

      expect(response.error).toContain('Failed to initialize installer directory');
    });
  });

  describe('hot reload integration', () => {
    it('should attempt hot reload after successful install', async () => {
      const mockCommand = createMockCommand('test-command', 'A test command');
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
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

      expect(mockContext.toolRegistry!.hotReloadCommand).toHaveBeenCalledWith(mockCommand);
      expect(mockContext.toolRegistry!.getAllTools).toHaveBeenCalled();
    });

    it('should attempt hot reload after successful update', async () => {
      const mockCommand = createMockCommand('test-command', 'Updated test command');
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
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

      expect(mockContext.toolRegistry!.hotReloadCommand).toHaveBeenCalledWith(mockCommand);
    });

    it('should handle missing tool registry gracefully', async () => {
      const contextWithoutRegistry = {
        ...mockContext,
        toolRegistry: undefined as any,
      };

      const mockCommand = createMockCommand('test-command', 'A test command');
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
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
        contextWithoutRegistry,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: string; text: string };
      const response = JSON.parse(content.text);

      expect(response.success).toBe(true);
      // Should still succeed even without tool registry
    });
  });

  describe('invalid command package handling', () => {
    it('should handle package that does not export valid command', async () => {
      // Mock loadInstalledCommand to return null (invalid command)
      mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(null);

      // Mock install to throw the expected error for invalid commands
      mockInstaller.install = vi.fn().mockRejectedValue(
        new Error('Package \'invalid-package\' does not export a valid MCP Funnel command'),
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

      expect(response.error).toContain('does not export a valid MCP Funnel command');
    });
  });
});