import { existsSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

/**
 * Find the nearest tsconfig.json by walking up the directory tree.
 *
 * Starts from the file's directory and walks up until a tsconfig.json
 * is found or the filesystem root is reached.
 *
 * @param filePath - Starting file path (absolute or relative)
 * @returns Absolute path to tsconfig.json, or null if not found
 *
 * @example
 * ```typescript
 * // From /workspace/packages/core/src/index.ts
 * const tsconfig = findNearestTsconfig('/workspace/packages/core/src/index.ts');
 * // Returns: /workspace/packages/core/tsconfig.json
 * ```
 */
export function findNearestTsconfig(filePath: string): string | null {
  let currentDir = dirname(resolve(filePath));
  const root = parse(currentDir).root;

  while (currentDir !== root) {
    const tsconfigPath = join(currentDir, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
      return tsconfigPath;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break; // Reached root
    currentDir = parentDir;
  }

  return null;
}
