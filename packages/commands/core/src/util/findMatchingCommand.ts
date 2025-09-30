import type { CommandManifest, InstalledCommand } from '../types/index.js';
import { extractPackageNameFromSpec } from './extractPackageNameFromSpec.js';

/**
 * Finds an installed command that matches the given package spec.
 *
 * Searches the manifest for a command whose package name matches the provided spec.
 * Handles multiple matching strategies including direct matches, normalized package
 * names (without version info), and scoped package variations.
 * @param manifest - Command manifest containing all installed commands
 * @param packageSpec - Package specification to search for (can include version, git URL, scope, etc.)
 * @returns The matching installed command, or undefined if no match found
 * @example
 * ```typescript
 * const manifest = await readManifest(context.manifestPath);
 * const existing = findMatchingCommand(manifest, '@myorg/tool@1.0.0');
 * if (existing) {
 *   console.log(`Found: ${existing.package} v${existing.version}`);
 * }
 * ```
 * @see file:./extractPackageNameFromSpec.ts:5-29 - Package name normalization logic
 * @internal
 */
export function findMatchingCommand(
  manifest: CommandManifest,
  packageSpec: string,
): InstalledCommand | undefined {
  return manifest.commands.find((cmd) =>
    packageMatchesSpec(cmd.package, packageSpec),
  );
}

/**
 * Checks if an installed package matches the given package spec.
 *
 * Implements flexible matching logic to handle various package specification formats:
 * - Direct string equality
 * - Normalized package names (strips version info)
 * - Scoped package variations (with/without \@ prefix)
 * - Git URL extraction (e.g., git+https://host/scope/package.git)
 * @param installedPackage - The package name as stored in the manifest (e.g., '\@myorg/tool')
 * @param packageSpec - The package specification provided by the user (can include version, git URL, etc.)
 * @returns True if the package matches the spec, false otherwise
 * @internal
 */
function packageMatchesSpec(
  installedPackage: string,
  packageSpec: string,
): boolean {
  // Direct match
  if (installedPackage === packageSpec) {
    return true;
  }

  // Extract the package name from the spec (removes version, git info, etc)
  const normalizedSpec = extractPackageNameFromSpec(packageSpec);
  if (installedPackage === normalizedSpec) {
    return true;
  }

  // For scoped packages, also check without the scope
  // This handles cases where user might install "@scope/package" as "scope/package"
  if (installedPackage.startsWith('@')) {
    // Remove @ prefix to get "scope/package"
    const withoutAt = installedPackage.slice(1);
    if (packageSpec === withoutAt || normalizedSpec === withoutAt) {
      return true;
    }

    // Special-case git URLs: scoped packages installed via git often arrive as
    // git+https://host/scope/package.git. Ensure we detect those installs.
    if (packageSpec.includes('://') || packageSpec.includes('git+')) {
      // Extract the path from the git URL
      const urlMatch = packageSpec.match(
        /(?:git\+)?https?:\/\/[^/]+\/(.+?)(?:\.git)?(?:#.*)?$/,
      );
      if (urlMatch) {
        const urlPath = urlMatch[1];
        const scopeSlashPair = withoutAt;
        // Only match if the URL path is EXACTLY the scope/package
        // This prevents false positives like "other/myorg/tool" matching "@myorg/tool"
        if (urlPath === scopeSlashPair) {
          return true;
        }
      }
    }
  }

  // No match
  return false;
}
