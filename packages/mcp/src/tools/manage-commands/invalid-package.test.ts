import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTest, cleanupTest, type TestFixture } from './test/utils.js';

describe('ManageCommands - invalid command package handling', () => {
  let fixture: TestFixture;

  beforeEach(async () => {
    fixture = await setupTest();
  });

  afterEach(async () => {
    await cleanupTest(fixture);
  });

  it('should handle package that does not export valid command', async () => {
    // Mock loadInstalledCommand to return null (invalid command)
    fixture.mockInstaller.loadInstalledCommand = vi.fn().mockResolvedValue(null);

    // Mock install to throw the expected error for invalid commands
    fixture.mockInstaller.install = vi
      .fn()
      .mockRejectedValue(
        new Error("Package 'invalid-package' does not export a valid MCP Funnel command"),
      );

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

    expect(response.error).toContain('does not export a valid MCP Funnel command');
  });
});
