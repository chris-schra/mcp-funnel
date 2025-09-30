import type { CommandManifest } from '../types/index.js';
import { findMatchingCommand } from './findMatchingCommand.js';
import { getDependencyEntries } from './getDependencyEntries.js';

/**
 * Get dependency names from package.json
 */
function getDependencyNames(pkgJson: Record<string, unknown>): string[] {
  const deps = getDependencyEntries(pkgJson);
  return deps.map(([name]) => name);
}

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
