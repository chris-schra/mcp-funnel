/**
 * Tests for CommandInstaller - scoped package handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { type CommandManifest } from '../types/index.js';
import { TestableCommandInstaller } from '../installer.test-harness.js';
import { TestUtils } from './test-utils.js';

describe('CommandInstaller - scoped package handling', () => {
  let mockManifest: CommandManifest;
  let installer: TestableCommandInstaller;

  beforeEach(() => {
    installer = new TestableCommandInstaller();
    mockManifest = TestUtils.createMockManifest();
  });

  it('should match scoped packages without @ prefix', () => {
    const result = installer.testFindMatchingCommand(mockManifest, 'myorg/weather-helper');
    expect(result?.package).toBe('@myorg/weather-helper');
  });

  it('should match scoped packages without @ prefix with version', () => {
    const result = installer.testFindMatchingCommand(mockManifest, 'myorg/weather-helper@2.0.0');
    expect(result?.package).toBe('@myorg/weather-helper');
  });

  it('should not match scope-like strings for non-scoped packages', () => {
    const result = installer.testFindMatchingCommand(mockManifest, 'weather/tool');
    expect(result).toBeUndefined();
  });
});
