import { promises as fs } from 'fs';
import type { CommandManifest } from '../types/index.js';

/**
 * Reads the command manifest from the specified path.
 *
 * If the file does not exist or cannot be parsed, returns an empty manifest
 * with a current timestamp instead of throwing an error. This behavior ensures
 * the system can gracefully initialize from a missing manifest file.
 * @param manifestPath - Absolute path to the manifest JSON file
 * @returns Promise resolving to the parsed manifest, or an empty manifest with current timestamp on error
 * @public
 * @see file:./writeManifest.ts - Corresponding write operation
 * @see file:../types/index.ts:9 - CommandManifest type definition
 */
export async function readManifest(
  manifestPath: string,
): Promise<CommandManifest> {
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      commands: [],
      updatedAt: new Date().toISOString(),
    };
  }
}
