import { Package } from './types/registry.types.js';

/**
 * Default command and prefix arguments for a package registry type.
 * @public
 */
export type PackageDefaults = {
  /** Command to execute (e.g., 'npx', 'uvx', 'docker') */
  command: string;
  /** Arguments that come before the package identifier */
  prefixArgs: string[];
};

/**
 * Package command configuration with command and arguments.
 * @public
 */
export type PackageCommandConfig = {
  /** Command to execute */
  command: string;
  /** Full arguments array for execution */
  args: string[];
};

/**
 * Gets default command and prefix arguments for a package registry type.
 * @param registryType - The type of package registry
 * @returns Default configuration or null if registry type is unknown
 * @public
 */
export function getPackageDefaults(registryType: string): PackageDefaults | null {
  switch (registryType) {
    case 'npm':
      return { command: 'npx', prefixArgs: ['-y'] };
    case 'pypi':
      return { command: 'uvx', prefixArgs: [] };
    case 'oci':
      return { command: 'docker', prefixArgs: ['run', '-i', '--rm'] };
    case 'github':
      return { command: 'npx', prefixArgs: ['-y'] };
    default:
      return null;
  }
}

/**
 * Gets the package identifier with registry-specific transformations.
 * @param pkg - Package metadata
 * @returns Transformed identifier (e.g., 'github:owner/repo' for GitHub packages)
 * @public
 */
export function getPackageIdentifier(pkg: Package): string {
  if (pkg.registry_type === 'github') {
    return `github:${pkg.identifier}`;
  }
  return pkg.identifier;
}

/**
 * Builds command and arguments configuration from package metadata.
 * Respects runtime_hint from the registry, falling back to defaults.
 * @param pkg - Package metadata from registry
 * @param defaults - Default command and prefix args for this registry type
 * @returns Command and arguments array for execution
 * @public
 */
export function buildPackageCommand(pkg: Package, defaults: PackageDefaults): PackageCommandConfig {
  const identifier = getPackageIdentifier(pkg);

  if (pkg.runtime_hint) {
    // Publisher has full control when hint is provided
    return {
      command: pkg.runtime_hint,
      args: [...(pkg.runtime_arguments || []), identifier, ...(pkg.package_arguments || [])],
    };
  }

  // Default behavior when no hint provided
  return {
    command: defaults.command,
    args: [...defaults.prefixArgs, identifier, ...(pkg.package_arguments || [])],
  };
}

/**
 * Converts environment variables from array to object format.
 * Only includes variables that have values (excludes required-only vars).
 * @param pkg - Package metadata containing environment variables
 * @returns Environment variables object or undefined if none with values
 * @public
 */
export function convertEnvironmentVariables(pkg: Package): Record<string, string> | undefined {
  if (!pkg.environment_variables || pkg.environment_variables.length === 0) {
    return undefined;
  }

  const env: Record<string, string> = {};
  for (const envVar of pkg.environment_variables) {
    if (envVar.value !== undefined) {
      env[envVar.name] = envVar.value;
    }
  }

  return Object.keys(env).length > 0 ? env : undefined;
}
