import { join } from 'path';

/**
 * Get the path to an installed package in the packages directory
 * @param packagesDir - The base packages directory
 * @param packageName - The name of the package
 * @returns The full path to the package in node_modules
 */
export function getPackagePath(
  packagesDir: string,
  packageName: string,
): string {
  return join(packagesDir, 'node_modules', packageName);
}
