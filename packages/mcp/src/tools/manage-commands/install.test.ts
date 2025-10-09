import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { setupTest, cleanupTest, createMockCommand, type TestFixture } from './test/utils.js';

describe('ManageCommands - install action', () => {
  let fixture: TestFixture;

  beforeEach(async () => {
    fixture = await setupTest();
  });

  afterEach(async () => {
    await cleanupTest(fixture);
  });

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

    fixture.mockInstaller.install = vi.fn().mockResolvedValue(installedCommand);
    fixture.mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);

    const result = await fixture.tool.handle(
      {
        action: 'install',
        package: 'test-package',
      },
      fixture.mockContext,
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

    // Create manifest file with the existing command
    const manifestPath = fixture.mockInstaller.getManifestPath();
    const manifest = {
      commands: [existingCommand],
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    // Mock isInstalled to return true for existing command
    fixture.mockInstaller.isInstalled = vi.fn().mockResolvedValue(true);

    // Mock the install method to throw "already installed" error
    fixture.mockInstaller.install = vi
      .fn()
      .mockRejectedValue(new Error("Command package 'existing-package' is already installed"));

    const result = await fixture.tool.handle(
      {
        action: 'install',
        package: 'existing-package',
      },
      fixture.mockContext,
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
    fixture.mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);

    // Mock successful install with force
    fixture.mockInstaller.install = vi.fn().mockResolvedValue({
      name: 'test-command',
      package: 'test-package',
      version: '1.1.0',
      installedAt: new Date().toISOString(),
      description: 'A test command',
    });

    const result = await fixture.tool.handle(
      {
        action: 'install',
        package: 'test-package',
        force: true,
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    const response = JSON.parse(content.text);

    expect(response.success).toBe(true);
    expect(response.action).toBe('installed');
  });

  it('should install with specific version', async () => {
    const mockCommand = createMockCommand('test-command', 'A test command');
    fixture.mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);

    fixture.mockInstaller.install = vi.fn().mockResolvedValue({
      name: 'test-command',
      package: 'test-package',
      version: '2.0.0',
      installedAt: new Date().toISOString(),
      description: 'A test command',
    });

    const result = await fixture.tool.handle(
      {
        action: 'install',
        package: 'test-package',
        version: '2.0.0',
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    const response = JSON.parse(content.text);

    expect(response.success).toBe(true);
    expect(response.command.version).toBe('2.0.0');
  });

  it('should handle installation errors gracefully', async () => {
    fixture.mockInstaller.install = vi
      .fn()
      .mockRejectedValue(new Error('npm install failed: network error'));

    const result = await fixture.tool.handle(
      {
        action: 'install',
        package: 'invalid-package',
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    const response = JSON.parse(content.text);

    expect(response.error).toContain('npm install failed: network error');
  });

  it('should handle hot-reload failures gracefully', async () => {
    const mockCommand = createMockCommand('test-command', 'A test command');
    fixture.mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
    fixture.mockInstaller.install = vi.fn().mockResolvedValue({
      name: 'test-command',
      package: 'test-package',
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      description: 'A test command',
    });

    // Mock hot-reload failure
    fixture.mockContext.toolRegistry!.hotReloadCommand = vi.fn().mockImplementation(() => {
      throw new Error('Hot-reload failed');
    });

    const result = await fixture.tool.handle(
      {
        action: 'install',
        package: 'test-package',
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    const response = JSON.parse(content.text);

    expect(response.success).toBe(true);
    expect(response.hotReloadError).toBe('Hot-reload failed');
  });

  it('should attempt hot reload after successful install', async () => {
    const mockCommand = createMockCommand('test-command', 'A test command');
    fixture.mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
    fixture.mockInstaller.install = vi.fn().mockResolvedValue({
      name: 'test-command',
      package: 'test-package',
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      description: 'A test command',
    });

    await fixture.tool.handle(
      {
        action: 'install',
        package: 'test-package',
      },
      fixture.mockContext,
    );

    expect(fixture.mockContext.toolRegistry!.hotReloadCommand).toHaveBeenCalledWith(mockCommand);
    expect(fixture.mockContext.toolRegistry!.getAllTools).toHaveBeenCalled();
  });
});
