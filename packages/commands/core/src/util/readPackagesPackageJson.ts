import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Reads the package.json file from the packages directory.
 *
 * Used to inspect package dependencies before and after npm install operations
 * to determine which packages were installed or updated.
 * @param packagesDir - Absolute path to the packages directory containing package.json
 * @returns Promise resolving to the parsed package.json contents, or empty object if file doesn't exist or parsing fails
 * @example
 * ```typescript
 * const packageJson = await readPackagesPackageJson('/app/packages');
 * console.log(packageJson.dependencies);
 * ```
 * @public
 * @see file:./install.ts:45 - Used to track dependency changes during installation
 */
export async function readPackagesPackageJson(
  packagesDir: string,
): Promise<Record<string, unknown>> {
  const packageJsonPath = join(packagesDir, 'package.json');
  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}
