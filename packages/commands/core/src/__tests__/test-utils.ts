/**
 * Shared test utilities for CommandInstaller tests
 */

import { type CommandManifest } from '../types/index.js';

export interface TestCommandManifestOptions {
  includeScoped?: boolean;
  includeSimple?: boolean;
  includeGit?: boolean;
}

export const TestUtils = {
  /**
   * Create a mock manifest with various package types for testing
   * @param options - Configuration for which package types to include in the mock manifest
   * @returns Mock command manifest with configured package entries
   */
  createMockManifest(
    options: TestCommandManifestOptions = {
      includeScoped: true,
      includeSimple: true,
      includeGit: true,
    },
  ): CommandManifest {
    const commands = [];

    if (options.includeSimple !== false) {
      commands.push({
        name: 'weather-tool',
        package: 'weather-tool',
        version: '1.0.0',
        installedAt: '2023-01-01T00:00:00.000Z',
        description: 'Weather information tool',
      });
    }

    if (options.includeScoped !== false) {
      commands.push({
        name: 'scoped-tool',
        package: '@myorg/weather-helper',
        version: '2.1.0',
        installedAt: '2023-01-02T00:00:00.000Z',
        description: 'Scoped weather helper',
      });
    }

    if (options.includeGit !== false) {
      commands.push({
        name: 'git-tool',
        package: '@github/actions-toolkit',
        version: '1.0.0',
        installedAt: '2023-01-03T00:00:00.000Z',
        description: 'GitHub actions toolkit',
      });
    }

    if (options.includeSimple !== false) {
      commands.push({
        name: 'simple-tool',
        package: 'lodash',
        version: '4.17.21',
        installedAt: '2023-01-04T00:00:00.000Z',
        description: 'Utility library',
      });
    }

    return {
      commands,
      updatedAt: '2023-01-04T00:00:00.000Z',
    };
  },
};
