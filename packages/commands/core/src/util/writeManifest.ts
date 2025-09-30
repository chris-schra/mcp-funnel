import type { CommandManifest } from '../types/index.js';
import * as fs from 'node:fs/promises';

/**
 * Writes the command manifest to disk as formatted JSON.
 *
 * Serializes the manifest with 2-space indentation for human readability.
 * This function is called after any modification to the command registry
 * (install, update, or uninstall operations).
 * @param manifestPath - Absolute path where the manifest JSON file will be written
 * @param manifest - Command manifest object containing installed commands and metadata
 * @returns Promise that resolves when the file write completes
 * @throws {Error} When the file cannot be written (permissions, disk space, invalid path)
 * @public
 * @see file:./readManifest.ts - Corresponding read operation
 * @see file:../types/index.ts:9 - CommandManifest type definition
 */
export async function writeManifest(
  manifestPath: string,
  manifest: CommandManifest,
): Promise<void> {
  return fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
