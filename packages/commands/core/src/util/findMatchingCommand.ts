import type { CommandManifest, InstalledCommand } from '../types/index.js';
import { extractPackageNameFromSpec } from './extractPackageNameFromSpec.js';

/**
 * Find a matching command in the manifest based on the package spec
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
 * Check if an installed package matches the given package spec
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
