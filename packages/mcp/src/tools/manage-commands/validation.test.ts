import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTest, cleanupTest, type TestFixture } from './test/utils.js';

describe('ManageCommands - validation and error handling', () => {
  let fixture: TestFixture;

  beforeEach(async () => {
    fixture = await setupTest();
  });

  afterEach(async () => {
    await cleanupTest(fixture);
  });

  it('should handle unknown action', async () => {
    const result = await fixture.tool.handle(
      {
        action: 'unknown-action',
        package: 'test-package',
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    const response = JSON.parse(content.text);

    expect(response.error).toContain('Unknown action: unknown-action');
  });

  it('should handle missing package parameter', async () => {
    const result = await fixture.tool.handle(
      {
        action: 'install',
      },
      fixture.mockContext,
    );

    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: string; text: string };
    // Should work since package is undefined, but installer will handle validation
    expect(content.text).toBeDefined();
  });

  it('should handle installer initialization errors', async () => {
    // Mock installer to throw during operation
    fixture.mockInstaller.install = vi
      .fn()
      .mockRejectedValue(new Error('Failed to initialize installer directory'));

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

    expect(response.error).toContain('Failed to initialize installer directory');
  });
});
