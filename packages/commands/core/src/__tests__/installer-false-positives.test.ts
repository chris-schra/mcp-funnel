/**
 * Tests for CommandInstaller - false positive prevention
 * These tests ensure substring matches don't incorrectly match packages
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { type CommandManifest } from '../types/index.js';
import { TestableCommandInstaller } from '../installer.test-harness.js';
import { TestUtils } from './test-utils.js';

describe('CommandInstaller - false positive prevention', () => {
  let mockManifest: CommandManifest;
  let installer: TestableCommandInstaller;

  beforeEach(() => {
    installer = new TestableCommandInstaller();
    mockManifest = TestUtils.createMockManifest();
  });

  it('should NOT match substring of package name', () => {
    // This is the critical test case - "weather" should NOT match "weather-tool"
    const result = installer.testFindMatchingCommand(mockManifest, 'weather');
    expect(result).toBeUndefined();
  });

  it('should NOT match packages containing the spec as substring', () => {
    // "helper" should NOT match "@myorg/weather-helper"
    const result = installer.testFindMatchingCommand(mockManifest, 'helper');
    expect(result).toBeUndefined();
  });

  it('should NOT match packages where spec is contained within', () => {
    // "org" should NOT match "@myorg/weather-helper"
    const result = installer.testFindMatchingCommand(mockManifest, 'org');
    expect(result).toBeUndefined();
  });

  it('should NOT match partial scoped package names', () => {
    // "myorg" should NOT match "@myorg/weather-helper"
    const result = installer.testFindMatchingCommand(mockManifest, 'myorg');
    expect(result).toBeUndefined();
  });

  it('should NOT match suffix substrings', () => {
    // "tool" should NOT match "weather-tool"
    const result = installer.testFindMatchingCommand(mockManifest, 'tool');
    expect(result).toBeUndefined();
  });

  it('should NOT match middle substrings', () => {
    // "ther" should NOT match "weather-tool"
    const result = installer.testFindMatchingCommand(mockManifest, 'ther');
    expect(result).toBeUndefined();
  });

  it('should NOT match case-sensitive variations', () => {
    const result = installer.testFindMatchingCommand(mockManifest, 'Weather-Tool');
    expect(result).toBeUndefined();
  });
});
