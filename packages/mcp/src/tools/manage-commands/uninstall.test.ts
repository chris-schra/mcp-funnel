import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTest, cleanupTest, type TestFixture } from './test/utils.js';

describe('ManageCommands - uninstall action', () => {
  let fixture: TestFixture;

  beforeEach(async () => {
    fixture = await setupTest();
  });

  afterEach(async () => {
    await cleanupTest(fixture);
  });

  it('should uninstall command successfully', async () => {
    fixture.mockInstaller.uninstall = vi.fn().mockResolvedValue(undefined);

    const result = await fixture.tool.handle(
      {
        action: 'uninstall',
        package: 'test-package',
      },
      fixture.mockContext,
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
    fixture.mockInstaller.uninstall = vi.fn().mockResolvedValue(undefined);

    const result = await fixture.tool.handle(
      {
        action: 'uninstall',
        package: 'test-package',
        removeData: true,
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    const response = JSON.parse(content.text);

    expect(response.success).toBe(true);
    expect(fixture.mockInstaller.uninstall).toHaveBeenCalledWith('test-package', {
      removeData: true,
    });
  });

  it('should handle uninstall errors', async () => {
    fixture.mockInstaller.uninstall = vi
      .fn()
      .mockRejectedValue(new Error("Command 'nonexistent' is not installed"));

    const result = await fixture.tool.handle(
      {
        action: 'uninstall',
        package: 'nonexistent',
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    const response = JSON.parse(content.text);

    expect(response.error).toContain("Command 'nonexistent' is not installed");
  });
});
