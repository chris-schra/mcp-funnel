import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupTest,
  cleanupTest,
  createMockCommand,
  createMockContext,
  type TestFixture,
} from './test/utils.js';

describe('ManageCommands - hot reload integration', () => {
  let fixture: TestFixture;

  beforeEach(async () => {
    fixture = await setupTest();
  });

  afterEach(async () => {
    await cleanupTest(fixture);
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

  it('should handle missing tool registry gracefully', async () => {
    const contextWithoutRegistry = createMockContext({ toolRegistry: null });

    const mockCommand = createMockCommand('test-command', 'A test command');
    fixture.mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(mockCommand);
    fixture.mockInstaller.install = vi.fn().mockResolvedValue({
      name: 'test-command',
      package: 'test-package',
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      description: 'A test command',
    });

    const result = await fixture.tool.handle(
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
