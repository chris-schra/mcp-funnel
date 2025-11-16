import { promises as fs } from 'fs';
import path from 'path';

/**
 * Finds the closest tsconfig.json by walking up from a given directory.
 * Stops at filesystem root or when tsconfig.json is found.
 * @param startDir - Absolute path to start searching from
 * @returns Absolute path to tsconfig.json directory, or undefined if not found
 * @internal
 */
export async function findTsconfigDir(startDir: string): Promise<string | undefined> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');
    try {
      await fs.access(tsconfigPath);
      return currentDir; // Found tsconfig.json
    } catch {
      // Not found at this level, continue upward
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root without finding tsconfig.json
      break;
    }
    currentDir = parentDir;
  }

  return undefined;
}
