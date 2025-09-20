import { RegistryServer, Package } from './types/registry.types.js';
import { RegistryConfigEntry } from './types/config.types.js';

/**
 * Generates a server configuration snippet from registry server data.
 *
 * RUNTIME HINTS:
 * The function respects `pkg.runtime_hint` from the registry to allow
 * alternate launchers (e.g., 'pnpm dlx', 'yarn dlx', 'pipx', 'podman').
 * Falls back to defaults ('npx', 'uvx', 'docker') when not specified.
 *
 * TYPE SAFETY:
 * Uses structured clone (JSON parse/stringify) for metadata to ensure deep copying
 * and type safety. This avoids shallow copy mutation issues and type casting violations.
 *
 * @param server - Registry server data containing package or remote configuration
 * @returns Configuration entry suitable for MCP client consumption
 */
export function generateConfigSnippet(
  server: RegistryServer,
): RegistryConfigEntry {
  const entry: RegistryConfigEntry = {
    name: server.name,
  };

  // Handle package-based servers first (they take precedence over remotes)
  if (server.packages && server.packages.length > 0) {
    const pkg = server.packages[0];
    let handled = false;

    switch (pkg.registry_type) {
      case 'npm':
        if (pkg.runtime_hint) {
          // Publisher has full control when hint is provided
          entry.command = pkg.runtime_hint;
          entry.args = [
            ...(pkg.runtime_arguments || []),
            pkg.identifier,
            ...(pkg.package_arguments || []),
          ];
        } else {
          // Default behavior when no hint provided
          entry.command = 'npx';
          entry.args = ['-y', pkg.identifier, ...(pkg.package_arguments || [])];
        }
        handled = true;
        break;
      case 'pypi':
        if (pkg.runtime_hint) {
          entry.command = pkg.runtime_hint;
          entry.args = [
            ...(pkg.runtime_arguments || []),
            pkg.identifier,
            ...(pkg.package_arguments || []),
          ];
        } else {
          // Default behavior
          entry.command = 'uvx';
          entry.args = [pkg.identifier, ...(pkg.package_arguments || [])];
        }
        handled = true;
        break;
      case 'oci':
        if (pkg.runtime_hint) {
          entry.command = pkg.runtime_hint;
          entry.args = [
            ...(pkg.runtime_arguments || []),
            pkg.identifier,
            ...(pkg.package_arguments || []),
          ];
        } else {
          // Default behavior
          entry.command = 'docker';
          entry.args = [
            'run',
            '-i',
            '--rm',
            pkg.identifier,
            ...(pkg.package_arguments || []),
          ];
        }
        handled = true;
        break;
      case 'github':
        if (pkg.runtime_hint) {
          entry.command = pkg.runtime_hint;
          entry.args = [
            ...(pkg.runtime_arguments || []),
            `github:${pkg.identifier}`,
            ...(pkg.package_arguments || []),
          ];
        } else {
          // Default behavior
          entry.command = 'npx';
          entry.args = [
            '-y',
            `github:${pkg.identifier}`,
            ...(pkg.package_arguments || []),
          ];
        }
        handled = true;
        break;
    }

    if (handled) {
      // Convert environment variables from array to object format
      // Only include variables that have values (exclude required-only vars)
      if (pkg.environment_variables && pkg.environment_variables.length > 0) {
        entry.env = {};
        for (const envVar of pkg.environment_variables) {
          if (envVar.value !== undefined) {
            entry.env[envVar.name] = envVar.value;
          }
        }
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

/**
 * Helper to generate command and args JSON lines for install instructions
 * Eliminates redundancy across npm, pypi, and oci package types
 */
function generateCommandArgsLines(
  pkg: Package,
  defaultCommand: string,
  defaultArgs: string[],
): { lines: string[]; hasEnvVars: boolean } {
  const lines: string[] = [];
  const command = pkg.runtime_hint || defaultCommand;
  lines.push(`  "command": ${JSON.stringify(command)},`);

  let argsArray: string[];
  if (pkg.runtime_hint) {
    // Publisher has full control when hint is provided
    argsArray = [
      ...(pkg.runtime_arguments || []),
      pkg.identifier,
      ...(pkg.package_arguments || []),
    ];
  } else {
    // Default behavior when no hint provided
    argsArray = [...defaultArgs, ...(pkg.package_arguments || [])];
  }

  // Check if environment variables follow
  const hasEnvVars = Boolean(
    pkg.environment_variables &&
      pkg.environment_variables.some((env) => env.value !== undefined),
  );
  const argsComma = hasEnvVars ? ',' : '';
  lines.push(`  "args": ${JSON.stringify(argsArray)}${argsComma}`);

  return { lines, hasEnvVars };
}

/**
 * Generates human-readable installation instructions for a server
 */
export function generateInstallInstructions(server: RegistryServer): string {
  const lines: string[] = [];

  lines.push(`# Installation Instructions for ${server.name}`);
  lines.push('');
  lines.push(server.description);
  lines.push('');

  // Handle remote servers
  if (server.remotes && server.remotes.length > 0) {
    const remote = server.remotes[0];
    lines.push('## Remote Server Setup');
    lines.push('');
    lines.push(
      'This server runs remotely and does not require local installation.',
    );
    lines.push('');
    lines.push('### Configuration');
    lines.push('Add the following to your MCP client configuration:');
    lines.push('');
    lines.push('```json');
    lines.push(`${JSON.stringify(server.name)}: {`);
    lines.push(`  "transport": ${JSON.stringify(remote.type)},`);
    const hasHeaders = Boolean(remote.headers && remote.headers.length > 0);
    lines.push(
      `  "url": ${JSON.stringify(remote.url)}${hasHeaders ? ',' : ''}`,
    );
    if (hasHeaders && remote.headers) {
      lines.push('  "headers": {');
      remote.headers.forEach((header, index, arr) => {
        const comma = index < arr.length - 1 ? ',' : '';
        // Use header.name as key and header.value as value
        lines.push(
          `    ${JSON.stringify(header.name)}: ${JSON.stringify(header.value ?? '')}${comma}`,
        );
      });
      lines.push('  }');
    }
    lines.push('}');
    lines.push('```');

    // Add authentication note if headers are present
    if (remote.headers && remote.headers.length > 0) {
      lines.push('');
      lines.push('### Authentication');
      lines.push(
        'This server requires authentication tokens or API keys in the headers. Make sure to:',
      );
      lines.push(
        '- Replace placeholder values (e.g., ${API_TOKEN}) with actual credentials',
      );
      lines.push(
        '- Keep authentication tokens secure and do not commit them to version control',
      );
    }

    return lines.join('\n');
  }

  // Handle package-based servers
  if (server.packages && server.packages.length > 0) {
    const pkg = server.packages[0];

    lines.push('## Prerequisites');
    lines.push('');

    switch (pkg.registry_type) {
      case 'npm':
        lines.push('- Node.js and npm installed');
        lines.push('- Internet connection for package installation');
        break;
      case 'pypi':
        lines.push('- Python and uvx installed (pip install uvx)');
        lines.push('- Internet connection for package installation');
        break;
      case 'oci':
        lines.push('- Docker installed and running');
        lines.push('- Internet connection for container image pulling');
        lines.push('- docker pull permission for the specified container');
        break;
      case 'github':
        lines.push('- Node.js and npm installed');
        lines.push('- Internet connection for package installation');
        break;
      default:
        lines.push(`- Check documentation for ${pkg.identifier} package`);
        lines.push('- manual configuration may be required');
        break;
    }

    lines.push('');
    lines.push('## Configuration');
    lines.push('Add the following to your MCP client configuration:');
    lines.push('');
    lines.push('```json');
    lines.push(`${JSON.stringify(server.name)}: {`);

    switch (pkg.registry_type) {
      case 'npm': {
        const result = generateCommandArgsLines(pkg, 'npx', [
          '-y',
          pkg.identifier,
        ]);
        lines.push(...result.lines);
        break;
      }
      case 'pypi': {
        const result = generateCommandArgsLines(pkg, 'uvx', [pkg.identifier]);
        lines.push(...result.lines);
        break;
      }
      case 'oci': {
        const result = generateCommandArgsLines(pkg, 'docker', [
          'run',
          '-i',
          '--rm',
          pkg.identifier,
        ]);
        lines.push(...result.lines);
        break;
      }
      default:
        lines.push(
          `  // Configuration depends on package type for ${pkg.identifier}`,
        );
        break;
    }

    if (pkg.environment_variables && pkg.environment_variables.length > 0) {
      // Only include variables with values in the config
      const varsWithValues = pkg.environment_variables.filter(
        (env) => env.value !== undefined,
      );
      if (varsWithValues.length > 0) {
        lines.push('  "env": {');
        varsWithValues.forEach((envVar, index, arr) => {
          const comma = index < arr.length - 1 ? ',' : '';
          const value = envVar.value;
          lines.push(
            `    ${JSON.stringify(envVar.name)}: ${JSON.stringify(value)}${comma}`,
          );
        });
        lines.push('  }');
      }
    }

    lines.push('}');
    lines.push('```');

    if (
      pkg.environment_variables &&
      pkg.environment_variables.some((env) => env.is_required)
    ) {
      lines.push('');
      const requiredVars = pkg.environment_variables.filter(
        (env) => env.is_required,
      );
      const title =
        requiredVars.length === 1
          ? 'Required environment variable'
          : 'Required Environment Variables';
      lines.push(`## ${title}`);
      lines.push('');
      requiredVars.forEach((env) => {
        lines.push(
          `- **${env.name}**: ${env.value ? `Default: ${env.value}` : 'required - please set this value'}`,
        );
      });
    }
  }

  if (!server.remotes && !server.packages) {
    lines.push('No installation method available for this server.');
  }

  return lines.join('\n');
}
