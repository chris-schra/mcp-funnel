export function getDependencyEntries(
  pkgJson: Record<string, unknown>,
): [string, string][] {
  const deps = pkgJson.dependencies as Record<string, string> | undefined;
  if (!deps) {
    return [];
  }
  return Object.entries(deps);
}
