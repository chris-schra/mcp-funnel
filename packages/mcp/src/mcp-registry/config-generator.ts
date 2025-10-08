import { RegistryServer } from './types/registry.types.js';
import { RegistryConfigEntry } from './types/config.types.js';
import {
  getPackageDefaults,
  buildPackageCommand,
  convertEnvironmentVariables,
} from './config-snippet-helpers.js';

/**
 * Generates a server configuration snippet from registry server data.
 *
 * Converts registry server metadata (packages or remotes) into a standardized
 * configuration entry suitable for MCP client consumption. Supports multiple
 * package registries (npm, pypi, oci, github) and remote server configurations.
 *
 * **Runtime Hints**: Respects `pkg.runtime_hint` from the registry to allow
 * alternate launchers (e.g., 'pnpm dlx', 'yarn dlx', 'pipx', 'podman').
 * Falls back to defaults ('npx', 'uvx', 'docker') when not specified.
 *
 * **Type Safety**: Uses structured clone (JSON parse/stringify) for metadata
 * to ensure deep copying and avoid shallow copy mutation issues.
 * @param server - Registry server data containing package or remote configuration
 * @returns Configuration entry suitable for MCP client consumption
 * @example
 * ```typescript
 * // Generate config for an npm package-based server
 * const server: RegistryServer = {
 *   name: 'github-server',
 *   packages: [{ registry_type: 'npm', identifier: '@modelcontextprotocol/server-github' }]
 * };
 * const config = generateConfigSnippet(server);
 * // Returns: { name: 'github-server', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] }
 * ```
 * @public
 */
export function generateConfigSnippet(server: RegistryServer): RegistryConfigEntry {
  const entry: RegistryConfigEntry = {
    name: server.name,
  };

  // Handle package-based servers first (they take precedence over remotes)
  if (server.packages && server.packages.length > 0) {
    const pkg = server.packages[0];
    const defaults = getPackageDefaults(pkg.registry_type);

    if (defaults) {
      const { command, args } = buildPackageCommand(pkg, defaults);
      entry.command = command;
      entry.args = args;

      const env = convertEnvironmentVariables(pkg);
      if (env) {
        entry.env = env;
      }

      return entry;
    }
  }

  // Handle remote servers
  if (server.remotes && server.remotes.length > 0) {
    const remote = server.remotes[0];
    entry.transport = remote.type;
    entry.url = remote.url;
    if (remote.headers && remote.headers.length > 0) {
      entry.headers = remote.headers;
    }
    return entry;
  }

  // Fallback for unknown types or missing configuration
  // Use structured clone to create a deep copy and ensure type safety
  entry._raw_metadata = JSON.parse(JSON.stringify(server));
  return entry;
}

// Re-export generateInstallInstructions from install-instructions-generator
export { generateInstallInstructions } from './install-instructions-generator.js';
