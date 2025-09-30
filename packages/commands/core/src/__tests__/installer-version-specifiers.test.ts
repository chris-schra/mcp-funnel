/**
 * Tests for CommandInstaller - version specifier handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { type CommandManifest } from '../types/index.js';
import { TestableCommandInstaller } from '../installer.test-harness.js';
import { TestUtils } from './test-utils.js';

describe('CommandInstaller - version specifier handling', () => {
  let mockManifest: CommandManifest;
  let installer: TestableCommandInstaller;

  beforeEach(() => {
    installer = new TestableCommandInstaller();
    mockManifest = TestUtils.createMockManifest();
  });

  it('should match package names with version specifiers', () => {
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'weather-tool@1.2.3',
    );
    expect(result?.package).toBe('weather-tool');
  });

  it('should match scoped packages with version specifiers', () => {
    const result = installer.testFindMatchingCommand(
      mockManifest,
      '@myorg/weather-helper@3.0.0',
    );
    expect(result?.package).toBe('@myorg/weather-helper');
  });

  it('should match packages with complex version specifiers', () => {
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'lodash@^4.17.0',
    );
    expect(result?.package).toBe('lodash');
  });

  it('should match packages with pre-release versions', () => {
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'weather-tool@1.0.0-beta.1',
    );
    expect(result?.package).toBe('weather-tool');
  });
});
