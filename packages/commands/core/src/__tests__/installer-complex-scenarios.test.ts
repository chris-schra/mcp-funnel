/**
 * Tests for CommandInstaller - complex matching scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { type CommandManifest } from '../types/index.js';
import { TestableCommandInstaller } from '../installer.test-harness.js';

describe('CommandInstaller - complex scenarios', () => {
  let installer: TestableCommandInstaller;

  beforeEach(() => {
    installer = new TestableCommandInstaller();
  });

  it('should handle packages with similar names but different scopes', () => {
    const complexManifest: CommandManifest = {
      commands: [
        {
          name: 'tool1',
          package: '@org1/common-tool',
          version: '1.0.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          name: 'tool2',
          package: '@org2/common-tool',
          version: '1.0.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
      ],
      updatedAt: '2023-01-01T00:00:00.000Z',
    };

    const result1 = installer.testFindMatchingCommand(
      complexManifest,
      '@org1/common-tool',
    );
    expect(result1?.package).toBe('@org1/common-tool');

    const result2 = installer.testFindMatchingCommand(
      complexManifest,
      '@org2/common-tool',
    );
    expect(result2?.package).toBe('@org2/common-tool');

    // Should not match the common part
    const result3 = installer.testFindMatchingCommand(
      complexManifest,
      'common-tool',
    );
    expect(result3).toBeUndefined();
  });

  it('should handle packages where one name is prefix of another', () => {
    const prefixManifest: CommandManifest = {
      commands: [
        {
          name: 'tool1',
          package: 'test',
          version: '1.0.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          name: 'tool2',
          package: 'test-utils',
          version: '1.0.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          name: 'tool3',
          package: 'test-framework-utils',
          version: '1.0.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
      ],
      updatedAt: '2023-01-01T00:00:00.000Z',
    };

    // Should match exactly
    const result1 = installer.testFindMatchingCommand(prefixManifest, 'test');
    expect(result1?.package).toBe('test');

    const result2 = installer.testFindMatchingCommand(
      prefixManifest,
      'test-utils',
    );
    expect(result2?.package).toBe('test-utils');

    // Should NOT match longer names even though they contain the spec
    const result3 = installer.testFindMatchingCommand(prefixManifest, 'utils');
    expect(result3).toBeUndefined();

    const result4 = installer.testFindMatchingCommand(
      prefixManifest,
      'framework',
    );
    expect(result4).toBeUndefined();
  });

  it('should correctly prioritize exact matches over partial matches', () => {
    const manifest: CommandManifest = {
      commands: [
        {
          name: 'weather-exact',
          package: 'weather',
          version: '1.0.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          name: 'weather-extended',
          package: 'weather-extended-tool',
          version: '1.0.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
      ],
      updatedAt: '2023-01-01T00:00:00.000Z',
    };

    const result = installer.testFindMatchingCommand(manifest, 'weather');
    expect(result?.package).toBe('weather');
    expect(result?.name).toBe('weather-exact');
  });
});
