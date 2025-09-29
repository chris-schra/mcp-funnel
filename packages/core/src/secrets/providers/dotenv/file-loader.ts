import { readFileSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import type { DotEnvProviderOptions } from './types.js';

export function resolveDotEnvPath(
  options: DotEnvProviderOptions,
  configFileDir?: string,
): string {
  if (isAbsolute(options.path)) {
    return options.path;
  }

  const baseDir = configFileDir || process.cwd();
  return resolve(baseDir, options.path);
}

export function readDotEnvFile(
  filePath: string,
  encoding: BufferEncoding,
): string {
  return readFileSync(filePath, encoding);
}

export function isMissingFileError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: unknown }).code === 'ENOENT';
  }
  return false;
}
