/**
 * TypeScript configuration file resolution utilities
 */

import { existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import type { TSConfigResolution } from '../types/index.js';

/**
 * Resolve tsconfig.json path from current working directory or provided path
 *
 * @param cwd - Current working directory
 * @param providedPath - Optional explicit path to tsconfig.json
 * @returns Resolution result with absolute path and existence status
 */
export function resolveTsConfig(cwd: string, providedPath?: string): TSConfigResolution {
  if (providedPath) {
    // Use provided path (make it absolute if relative)
    const absolutePath = resolve(cwd, providedPath);
    return {
      path: absolutePath,
      exists: existsSync(absolutePath),
    };
  }

  // Try to find tsconfig.json in current directory or parent directories
  const foundPath = findTsConfig(cwd);
  if (foundPath) {
    return {
      path: foundPath,
      exists: true,
    };
  }

  // Default to tsconfig.json in cwd (even if it doesn't exist)
  const defaultPath = resolve(cwd, 'tsconfig.json');
  return {
    path: defaultPath,
    exists: false,
  };
}

/**
 * Find tsconfig.json by walking up the directory tree
 *
 * @param startDir - Directory to start searching from
 * @returns Absolute path to tsconfig.json if found, undefined otherwise
 */
export function findTsConfig(startDir: string): string | undefined {
  let currentDir = resolve(startDir);
  const root = resolve('/');

  while (currentDir !== root) {
    const tsconfigPath = join(currentDir, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
      return tsconfigPath;
    }

    // Move up one directory
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached the root
      break;
    }
    currentDir = parentDir;
  }

  return undefined;
}
