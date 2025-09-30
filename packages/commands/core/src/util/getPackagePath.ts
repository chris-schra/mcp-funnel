import { join } from 'path';

/**
 * Constructs the absolute path to an installed package within the packages directory.
 *
 * Joins the base packages directory with 'node_modules' and the package name to create
 * the expected installation path for npm packages managed by the command installer.
 * @param packagesDir - Absolute path to the base packages directory containing node_modules
 * @param packageName - The npm package name (e.g., '\@scope/package' or 'package-name')
 * @returns Absolute path to the package directory within node_modules
 * @example
 * ```typescript
 * const path = getPackagePath('/app/packages', '@mcp-funnel/js-debugger');
 * // Returns: '/app/packages/node_modules/@mcp-funnel/js-debugger'
 * ```
 * @public
 * @see file:./loadCommand.ts:32 - Uses this path to load command implementations
 */
export function getPackagePath(
  packagesDir: string,
  packageName: string,
): string {
  return join(packagesDir, 'node_modules', packageName);
}
