/**
 * Extracts dependency entries from a package.json object.
 *
 * Returns an array of [packageName, version] tuples from the dependencies field.
 * Returns an empty array if no dependencies field exists.
 * @param pkgJson - Package.json data parsed as a record object
 * @returns Array of [packageName, versionSpec] tuples from the dependencies field, or empty array if no dependencies exist
 * @internal
 */
export function getDependencyEntries(
  pkgJson: Record<string, unknown>,
): [string, string][] {
  const deps = pkgJson.dependencies as Record<string, string> | undefined;
  if (!deps) {
    return [];
  }
  return Object.entries(deps);
}
