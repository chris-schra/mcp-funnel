/**
 * Tests for CommandInstaller - real-world package examples
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { type CommandManifest } from '../types/index.js';
import { TestableCommandInstaller } from '../installer.test-harness.js';

describe('CommandInstaller - real-world package examples', () => {
  let installer: TestableCommandInstaller;

  beforeEach(() => {
    installer = new TestableCommandInstaller();
  });

  it('should handle popular npm packages correctly', () => {
    const realWorldManifest: CommandManifest = {
      commands: [
        {
          name: 'react',
          package: 'react',
          version: '18.2.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          name: 'react-dom',
          package: 'react-dom',
          version: '18.2.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          name: 'types-react',
          package: '@types/react',
          version: '18.0.0',
          installedAt: '2023-01-01T00:00:00.000Z',
        },
      ],
      updatedAt: '2023-01-01T00:00:00.000Z',
    };

    // Should match each exactly
    expect(
      installer.testFindMatchingCommand(realWorldManifest, 'react')?.package,
    ).toBe('react');
    expect(
      installer.testFindMatchingCommand(realWorldManifest, 'react-dom')
        ?.package,
    ).toBe('react-dom');
    expect(
      installer.testFindMatchingCommand(realWorldManifest, '@types/react')
        ?.package,
    ).toBe('@types/react');

    // Should handle versions
    expect(
      installer.testFindMatchingCommand(realWorldManifest, 'react@18.0.0')
        ?.package,
    ).toBe('react');
    expect(
      installer.testFindMatchingCommand(
        realWorldManifest,
        '@types/react@17.0.0',
      )?.package,
    ).toBe('@types/react');

    // Should handle scoped packages without @
    expect(
      installer.testFindMatchingCommand(realWorldManifest, 'types/react')
        ?.package,
    ).toBe('@types/react');
  });
});
