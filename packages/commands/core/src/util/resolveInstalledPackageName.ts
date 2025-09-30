import type { CommandManifest } from '../types/index.js';
import { findMatchingCommand } from './findMatchingCommand.js';
import { getDependencyEntries } from './getDependencyEntries.js';

/**
 * Extracts dependency names from a package.json object.
 * @param pkgJson - Package.json data parsed as a record object
 * @returns Array of dependency package names
 * @internal
 */
function getDependencyNames(pkgJson: Record<string, unknown>): string[] {
  const deps = getDependencyEntries(pkgJson);
  return deps.map(([name]) => name);
}

/**
 * Resolves the actual installed package name after npm install by comparing package.json states.
 *
 * This function implements a multi-strategy approach to determine which package was actually
 * installed by npm, handling edge cases like:
 * - Packages already in the manifest
 * - Multiple new dependencies installed simultaneously
 * - Git URL installations that may not preserve the original spec
 * - Scoped packages with varying formats
 *
 * Resolution strategy (in order of precedence):
 * 1. Check if package already exists in the manifest
 * 2. If only one new dependency, use that
 * 3. Try the dependency guess (from extractPackageNameFromSpec)
 * 4. Match by comparing specs with package.json values (handles git URLs)
 * 5. Fall back to dependency guess
 * @param params - Resolution parameters
 * @param params.installSpec - The actual spec passed to `npm install` (may include version, e.g., `@scope/pkg@1.0.0`)
 * @param params.packageSpec - The original package spec from the user (e.g., `@scope/pkg`, `git+https://...`)
 * @param params.dependencyGuess - Pre-computed guess of the package name from extractPackageNameFromSpec or existing manifest
 * @param params.manifest - Current command manifest containing previously installed commands
 * @param params.packagesJsonBefore - Package.json state before npm install
 * @param params.packagesJsonAfter - Package.json state after npm install
 * @returns The resolved package name that was actually installed (e.g., `@scope/package` or `package-name`)
 * @example Basic installation
 * ```typescript
 * const resolvedName = resolveInstalledPackageName({
 *   installSpec: '@myorg/tool@1.0.0',
 *   packageSpec: '@myorg/tool',
 *   dependencyGuess: '@myorg/tool',
 *   manifest: { commands: [], updatedAt: '...' },
 *   packagesJsonBefore: { dependencies: {} },
 *   packagesJsonAfter: { dependencies: { '@myorg/tool': '1.0.0' } }
 * });
 * // Returns: '@myorg/tool'
 * ```
 * @example Git URL installation
 * ```typescript
 * const resolvedName = resolveInstalledPackageName({
 *   installSpec: 'git+https://github.com/org/repo.git',
 *   packageSpec: 'git+https://github.com/org/repo.git',
 *   dependencyGuess: 'repo',
 *   manifest: { commands: [], updatedAt: '...' },
 *   packagesJsonBefore: { dependencies: {} },
 *   packagesJsonAfter: { dependencies: { 'repo': 'git+https://...' } }
 * });
 * // Returns: 'repo'
 * ```
 * @see file:./findMatchingCommand.ts:27 - Checks for existing commands in manifest
 * @see file:./extractPackageNameFromSpec.ts:38 - Source of dependencyGuess
 * @see file:./install.ts:106 - Primary usage during package installation
 * @internal
 */
export function resolveInstalledPackageName({
  installSpec,
  packageSpec,
  dependencyGuess,
  manifest,
  packagesJsonBefore,
  packagesJsonAfter,
}: {
  installSpec: string;
  packageSpec: string;
  dependencyGuess: string;
  manifest: CommandManifest;
  packagesJsonBefore: Record<string, unknown>;
  packagesJsonAfter: Record<string, unknown>;
}): string {
  const beforeDeps = getDependencyNames(packagesJsonBefore);
  const afterDeps = getDependencyEntries(packagesJsonAfter);
  const existing = findMatchingCommand(manifest, packageSpec);

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
    if (value === packageSpec || value === installSpec) {
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
