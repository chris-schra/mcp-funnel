/**
 * Test utilities for CommandInstaller
 *
 * This file provides a minimal test-only wrapper that re-exports the
 * findMatchingCommand utility function for testing purposes.
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
 */
export class TestableCommandInstaller extends CommandInstaller {
  /**
   * Expose the findMatchingCommand utility for testing
   * This tests the REAL implementation, not a copy
   */
  public testFindMatchingCommand(
    manifest: CommandManifest,
    packageSpec: string,
  ): InstalledCommand | undefined {
    return findMatchingCommand(manifest, packageSpec);
  }
}
