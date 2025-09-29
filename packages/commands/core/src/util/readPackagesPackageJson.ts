import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Read the package.json from the packages directory
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
