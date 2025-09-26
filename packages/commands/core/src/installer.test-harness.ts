/**
 * Test utilities for CommandInstaller
 *
 * This file provides a minimal test-only class that extends CommandInstaller
 * to expose ONLY the matching logic for testing, without duplicating the implementation.
 */

import {
  CommandInstaller,
  type CommandManifest,
  type InstalledCommand,
} from './installer.js';

/**
 * Test-only extension of CommandInstaller that exposes the protected
 * findMatchingCommand method for testing purposes.
 *
 * This approach:
 * - Tests the ACTUAL production code, not a duplicate
 * - Maintains DRY principle
 * - Uses inheritance as a proper seam for testing
 * - Is clearly marked as test-only
 */
export class TestableCommandInstaller extends CommandInstaller {
  /**
   * Expose the protected findMatchingCommand for testing
   * This tests the REAL implementation, not a copy
   */
  testFindMatchingCommand(
    manifest: CommandManifest,
    packageSpec: string,
  ): InstalledCommand | undefined {
    // Call the protected method - no casting needed
    return this.findMatchingCommand(manifest, packageSpec);
  }
}
