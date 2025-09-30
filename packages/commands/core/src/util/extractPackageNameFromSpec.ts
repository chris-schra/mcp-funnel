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
