/**
 * Tests for CommandInstaller - git URL handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { type CommandManifest } from '../types/index.js';
import { TestableCommandInstaller } from '../installer.test-harness.js';
import { TestUtils } from './test-utils.js';

describe('CommandInstaller - git URL handling', () => {
  let mockManifest: CommandManifest;
  let installer: TestableCommandInstaller;

  beforeEach(() => {
    installer = new TestableCommandInstaller();
    mockManifest = TestUtils.createMockManifest();
  });

  it('should match git+https URLs containing scoped package path', () => {
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'git+https://github.com/github/actions-toolkit.git',
    );
    expect(result?.package).toBe('@github/actions-toolkit');
  });

  it('should match https git URLs containing scoped package path', () => {
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'https://github.com/github/actions-toolkit.git',
    );
    expect(result?.package).toBe('@github/actions-toolkit');
  });

  it('should match complex git URLs with additional path segments', () => {
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'git+https://github.com/github/actions-toolkit.git#main',
    );
    expect(result?.package).toBe('@github/actions-toolkit');
  });

  it('should not match git URLs that do not contain the scoped package path', () => {
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'git+https://github.com/other/different-package.git',
    );
    expect(result).toBeUndefined();
  });

  it('should NOT match git URLs with additional path segments (false positive prevention)', () => {
    // Critical test: @myorg/weather-helper should NOT match "other/myorg/weather-helper"
    const result1 = installer.testFindMatchingCommand(
      mockManifest,
      'git+https://github.com/other/myorg/weather-helper.git',
    );
    expect(result1).toBeUndefined(); // Should NOT match @myorg/weather-helper

    // @github/actions-toolkit should NOT match "org/github/actions-toolkit"
    const result2 = installer.testFindMatchingCommand(
      mockManifest,
      'git+https://github.com/org/github/actions-toolkit.git',
    );
    expect(result2).toBeUndefined(); // Should NOT match @github/actions-toolkit
  });

  it('should NOT match git URLs where package appears as substring', () => {
    // @myorg/weather-helper should NOT match URLs containing it as substring
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'git+https://github.com/bigmyorg/weather-helper-tools.git',
    );
    expect(result).toBeUndefined();
  });
});
