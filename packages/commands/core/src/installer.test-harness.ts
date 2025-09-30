/**
 * Test utilities for CommandInstaller
 *
 * This file provides a minimal test-only wrapper that re-exports the
 * findMatchingCommand utility function for testing purposes.
 * @internal
 * @see file:./util/findMatchingCommand.ts - Production implementation being tested
 */

import { CommandInstaller } from './installer.js';
import type { CommandManifest, InstalledCommand } from './types/index.js';
import { findMatchingCommand } from './util/index.js';

/**
 * Test-only wrapper that provides access to the findMatchingCommand utility
 * for testing purposes.
 *
 * This approach:
 * - Tests the ACTUAL production code, not a duplicate
 * - Maintains DRY principle
 * - Provides a clear seam for testing
 * - Is clearly marked as test-only
 * @example
 * ```typescript
 * const installer = new TestableCommandInstaller();
 * const result = installer.testFindMatchingCommand(manifest, 'weather-tool@1.0.0');
 * ```
 * @internal
 * @see file:./installer.test.ts - Test suite using this harness
 * @see file:./util/findMatchingCommand.ts - Production implementation being tested
 */
export class TestableCommandInstaller extends CommandInstaller {
  /**
   * Exposes the findMatchingCommand utility for testing package matching logic.
   *
   * Tests the REAL production implementation to verify package spec matching behavior,
   * including exact matches, version specifiers, scoped packages, and git URLs.
   * @param manifest - The command manifest containing installed commands to search
   * @param packageSpec - The package specification to match (e.g., 'pkg', '@scope/pkg', 'pkg@1.0.0', 'git+https://...')
   * @returns The matching installed command, or undefined if no match found
   * @example
   * ```typescript
   * const manifest: CommandManifest = {
   *   commands: [{ name: 'tool', package: 'weather-tool', version: '1.0.0', installedAt: '...' }],
   *   updatedAt: '...'
   * };
   * const result = installer.testFindMatchingCommand(manifest, 'weather-tool@2.0.0');
   * // Returns the installed command even though versions differ
   * ```
   * @see file:./util/findMatchingCommand.ts:9-16 - Production implementation
   * @see file:./installer.test.ts - Comprehensive test coverage
   */
  public testFindMatchingCommand(
    manifest: CommandManifest,
    packageSpec: string,
  ): InstalledCommand | undefined {
    return findMatchingCommand(manifest, packageSpec);
  }
}
