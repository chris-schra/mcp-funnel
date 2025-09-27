/**
 * Utilities for parsing, matching, and resolving package names
 */

import type {
  CommandManifest,
  InstalledCommand,
  PackageResolutionContext,
} from './installer-types.js';

/**
 * Package name parser and matcher utility class
 */
export class PackageUtils {
  /**
   * Find a command in the manifest that matches the given package spec
   */
  static findMatchingCommand(
    manifest: CommandManifest,
    packageSpec: string,
  ): InstalledCommand | undefined {
    return manifest.commands.find((cmd) =>
      PackageUtils.packageMatchesSpec(cmd.package, packageSpec),
    );
  }

  /**
   * Check if an installed package matches a given package spec
   */
  static packageMatchesSpec(
    installedPackage: string,
    packageSpec: string,
  ): boolean {
    // Direct match
    if (installedPackage === packageSpec) {
      return true;
    }

    // Extract the package name from the spec (removes version, git info, etc)
    const normalizedSpec = PackageUtils.extractPackageNameFromSpec(packageSpec);
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

  /**
   * Parse package name from various package specs
   */
  static parsePackageName(packageSpec: string): string {
    return PackageUtils.extractPackageNameFromSpec(packageSpec);
  }

  /**
   * Extract package name from package spec (removes version, git info, etc)
   */
  static extractPackageNameFromSpec(packageSpec: string): string {
    // Scoped packages may include version using a second '@'
    if (packageSpec.startsWith('@')) {
      const firstSlash = packageSpec.indexOf('/');
      const versionSeparator = packageSpec.lastIndexOf('@');
      if (versionSeparator > firstSlash) {
        return packageSpec.substring(0, versionSeparator);
      }
      return packageSpec;
    }

    // Git URLs or file specs don't encode the package name; fall back to repo tail
    if (packageSpec.includes('://') || packageSpec.includes('git+')) {
      const parts = packageSpec.split('/');
      const last = parts[parts.length - 1];
      return last.replace(/\.git$/, '');
    }

    if (packageSpec.includes('@')) {
      const [name] = packageSpec.split('@');
      return name;
    }

    return packageSpec;
  }

  /**
   * Resolve the actual installed package name from installation context
   */
  static resolveInstalledPackageName(
    context: PackageResolutionContext,
  ): string {
    const { manifest, packageSpec, dependencyGuess } = context;
    const beforeDeps = PackageUtils.getDependencyNames(
      context.packagesJsonBefore,
    );
    const afterDeps = PackageUtils.getDependencyEntries(
      context.packagesJsonAfter,
    );
    const existing = PackageUtils.findMatchingCommand(manifest, packageSpec);

    if (existing) {
      return existing.package;
    }

    const beforeSet = new Set(beforeDeps);
    const newDeps = afterDeps.filter(([name]) => !beforeSet.has(name));

    if (newDeps.length === 1) {
      return newDeps[0][0];
    }

    const guessEntry = afterDeps.find(([name]) => name === dependencyGuess);
    if (guessEntry) {
      return guessEntry[0];
    }

    const specMatch = afterDeps.find(([name, value]) => {
      if (value === packageSpec || value === context.installSpec) {
        return true;
      }
      if (typeof value === 'string') {
        // Git installs record the git reference in the value; ensure the package name is present
        if (
          (packageSpec.includes('://') || packageSpec.includes('git+')) &&
          value.includes(name)
        ) {
          return true;
        }
      }
      return false;
    });

    if (specMatch) {
      return specMatch[0];
    }

    return dependencyGuess;
  }

  /**
   * Get dependency names from package.json
   */
  static getDependencyNames(pkgJson: Record<string, unknown>): string[] {
    const deps = PackageUtils.getDependencyEntries(pkgJson);
    return deps.map(([name]) => name);
  }

  /**
   * Get dependency entries from package.json
   */
  static getDependencyEntries(
    pkgJson: Record<string, unknown>,
  ): [string, string][] {
    const deps = pkgJson.dependencies as Record<string, string> | undefined;
    if (!deps) {
      return [];
    }
    return Object.entries(deps);
  }
}
