import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTest, cleanupTest, createMockCommand, type TestFixture } from './test/utils.js';

describe('ManageCommands - update action', () => {
  let fixture: TestFixture;

  beforeEach(async () => {
    fixture = await setupTest();
  });

  afterEach(async () => {
    await cleanupTest(fixture);
  });

  it('should update command successfully', async () => {
    const updatedCommand = {
      name: 'test-command',
      package: 'test-package',
      version: '2.0.0',
      installedAt: new Date().toISOString(),
      description: 'Updated test command',
    };

    const mockCommand = createMockCommand('test-command', 'Updated test command');
    fixture.mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
    fixture.mockInstaller.update = vi.fn().mockResolvedValue(updatedCommand);

    const result = await fixture.tool.handle(
      {
        action: 'update',
        package: 'test-package',
      },
      fixture.mockContext,
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
    fixture.mockInstaller.update = vi
      .fn()
      .mockRejectedValue(new Error("Command 'nonexistent' is not installed"));

    const result = await fixture.tool.handle(
      {
        action: 'update',
        package: 'nonexistent',
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    const response = JSON.parse(content.text);

    expect(response.error).toContain("Command 'nonexistent' is not installed");
  });

  it('should update with hot-reload failure', async () => {
    const updatedCommand = {
      name: 'test-command',
      package: 'test-package',
      version: '2.0.0',
      installedAt: new Date().toISOString(),
      description: 'Updated test command',
    };

    fixture.mockInstaller.update = vi.fn().mockResolvedValue(updatedCommand);

    // Mock hot-reload to fail
    fixture.mockInstaller.loadInstalledCommand = vi
      .fn()
      .mockRejectedValue(new Error('Failed to load updated command'));

    const result = await fixture.tool.handle(
      {
        action: 'update',
        package: 'test-package',
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    const response = JSON.parse(content.text);

    expect(response.success).toBe(true);
    expect(response.hotReloaded).toBe(false);
    expect(response.hotReloadError).toBe('Failed to load updated command');
  });

  it('should attempt hot reload after successful update', async () => {
    const mockCommand = createMockCommand('test-command', 'Updated test command');
    fixture.mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
    fixture.mockInstaller.update = vi.fn().mockResolvedValue({
      name: 'test-command',
      package: 'test-package',
      version: '2.0.0',
      installedAt: new Date().toISOString(),
      description: 'Updated test command',
    });

    await fixture.tool.handle(
      {
        action: 'update',
        package: 'test-package',
      },
      fixture.mockContext,
    );

    expect(fixture.mockContext.toolRegistry!.hotReloadCommand).toHaveBeenCalledWith(mockCommand);
  });
});
