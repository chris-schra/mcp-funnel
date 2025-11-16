import { readFileSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import type { DotEnvProviderOptions } from './types.js';

/**
 * Resolves the absolute path to a .env file.
 *
 * If the path is already absolute, returns it unchanged. Otherwise,
 * resolves it relative to the config file directory or process.cwd().
 * @param options - DotEnv provider options containing the path
 * @param configFileDir - Optional base directory for relative path resolution
 * @returns Absolute path to the .env file
 * @internal
 */
export function resolveDotEnvPath(options: DotEnvProviderOptions, configFileDir?: string): string {
  if (isAbsolute(options.path)) {
    return options.path;
  }

  const baseDir = configFileDir || process.cwd();
  return resolve(baseDir, options.path);
}

/**
 * Reads a .env file from disk synchronously.
 * @param filePath - Absolute path to the .env file
 * @param encoding - Character encoding to use (typically 'utf-8')
 * @returns File contents as a string
 * @throws \{Error\} When file cannot be read (including ENOENT for missing files)
 * @internal
 */
export function readDotEnvFile(filePath: string, encoding: BufferEncoding): string {
  return readFileSync(filePath, encoding);
}

/**
 * Checks if an error indicates a missing file (ENOENT).
 * @param error - Error object to check
 * @returns True if error has code 'ENOENT', false otherwise
 * @internal
 */
export function isMissingFileError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: unknown }).code === 'ENOENT';
  }
  return false;
}
