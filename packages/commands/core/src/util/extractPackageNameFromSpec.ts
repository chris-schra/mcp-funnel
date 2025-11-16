/**
 * Extracts the bare package name from various npm package specification formats.
 *
 * Handles multiple package spec formats including:
 * - Scoped packages with versions: `@scope/package@1.0.0` → `@scope/package`
 * - Unscoped packages with versions: `package@1.0.0` → `package`
 * - Git URLs: `git+https://github.com/org/repo.git` → `repo`
 * - File specs: `file://path/to/package` → `package`
 * @param packageSpec - The package specification string (npm package name with optional version,
 *   git URL, or file path). Examples: `@scope/pkg@1.0.0`, `pkg@^2.0.0`, `git+https://...`,
 *   `file://...`
 * @returns The package name without version information or git metadata. For git URLs,
 *   returns the repository name (last path segment with `.git` removed).
 * @example Scoped package with version
 * ```typescript
 * extractPackageNameFromSpec('@myorg/tool@1.0.0');
 * // Returns: '@myorg/tool'
 * ```
 * @example Unscoped package with version
 * ```typescript
 * extractPackageNameFromSpec('weather-tool@2.1.0');
 * // Returns: 'weather-tool'
 * ```
 * @example Git URL
 * ```typescript
 * extractPackageNameFromSpec('git+https://github.com/org/my-package.git');
 * // Returns: 'my-package'
 * ```
 * @public
 * @see file:./findMatchingCommand.ts:33 - Primary usage in package matching
 * @see file:./install.ts:47 - Used for dependency name guessing
 */
export function extractPackageNameFromSpec(packageSpec: string): string {
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
