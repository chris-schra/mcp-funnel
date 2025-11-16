/**
 * Tests for CommandInstaller - exact package name matching
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { type CommandManifest } from '../types/index.js';
import { TestableCommandInstaller } from '../installer.test-harness.js';
import { TestUtils } from './test-utils.js';

describe('CommandInstaller - exact package name matches', () => {
  let mockManifest: CommandManifest;
  let installer: TestableCommandInstaller;

  beforeEach(() => {
    installer = new TestableCommandInstaller();
    mockManifest = TestUtils.createMockManifest();
  });

  it('should match exact package names', () => {
    const result = installer.testFindMatchingCommand(mockManifest, 'weather-tool');
    expect(result?.package).toBe('weather-tool');
  });

  it('should match exact scoped package names', () => {
    const result = installer.testFindMatchingCommand(mockManifest, '@myorg/weather-helper');
    expect(result?.package).toBe('@myorg/weather-helper');
  });

  it('should return undefined for non-existent packages', () => {
    const result = installer.testFindMatchingCommand(mockManifest, 'non-existent-package');
    expect(result).toBeUndefined();
  });
});
