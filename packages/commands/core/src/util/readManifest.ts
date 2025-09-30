import { promises as fs } from 'fs';
import type { CommandManifest } from '../types/index.js';

/**
 * Read the command manifest from the specified path
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
