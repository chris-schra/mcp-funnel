import type { CommandManifest } from '../types/index.js';
import * as fs from 'node:fs/promises';

/**
 * Write the command manifest
 */
export async function writeManifest(
  manifestPath: string,
  manifest: CommandManifest,
): Promise<void> {
  return fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
