/**
 * Tests for CommandInstaller - edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { type CommandManifest } from '../types/index.js';
import { TestableCommandInstaller } from '../installer.test-harness.js';
import { TestUtils } from './test-utils.js';

describe('CommandInstaller - edge cases', () => {
  let mockManifest: CommandManifest;
  let installer: TestableCommandInstaller;

  beforeEach(() => {
    installer = new TestableCommandInstaller();
    mockManifest = TestUtils.createMockManifest();
  });

  it('should handle empty string specs', () => {
    const result = installer.testFindMatchingCommand(mockManifest, '');
    expect(result).toBeUndefined();
  });

  it('should handle specs with only @ symbol', () => {
    const result = installer.testFindMatchingCommand(mockManifest, '@');
    expect(result).toBeUndefined();
  });

  it('should handle specs with only version', () => {
    const result = installer.testFindMatchingCommand(mockManifest, '@1.0.0');
    expect(result).toBeUndefined();
  });

  it('should handle malformed scoped package specs', () => {
    const result = installer.testFindMatchingCommand(mockManifest, '@/package');
    expect(result).toBeUndefined();
  });

  it('should handle multiple @ symbols correctly', () => {
    // extractPackageNameFromSpec('weather-tool@@1.0.0') returns 'weather-tool'
    // This should match the installed package
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'weather-tool@@1.0.0',
    );
    expect(result?.package).toBe('weather-tool');
  });

  it('should handle specs with special characters', () => {
    const result = installer.testFindMatchingCommand(
      mockManifest,
      'weather-tool#tag',
    );
    expect(result).toBeUndefined();
  });

  it('should handle very long package names', () => {
    const longName = 'a'.repeat(1000);
    const result = installer.testFindMatchingCommand(mockManifest, longName);
    expect(result).toBeUndefined();
  });
});
