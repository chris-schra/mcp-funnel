/**
 * Manifest file operations for command installation tracking
 */

import { promises as fs } from 'fs';
import type { CommandManifest } from './installer-types.js';

/**
 * Manages reading and writing of command installation manifest
 */
export class ManifestManager {
  constructor(private readonly manifestPath: string) {}

  /**
   * Read the command manifest from disk
   */
  async read(): Promise<CommandManifest> {
    try {
      const content = await fs.readFile(this.manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {
        commands: [],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Write the command manifest to disk
   */
  async write(manifest: CommandManifest): Promise<void> {
    await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Update manifest timestamp
   */
  updateTimestamp(manifest: CommandManifest): CommandManifest {
    return {
      ...manifest,
      updatedAt: new Date().toISOString(),
    };
  }
}
