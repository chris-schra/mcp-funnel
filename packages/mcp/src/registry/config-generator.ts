import { RegistryServer } from './types/registry.types.js';
import { RegistryConfigEntry } from './types/config.types.js';

/**
 * Generates a server configuration snippet from registry server data
 */
export function generateConfigSnippet(
  server: RegistryServer,
): RegistryConfigEntry {
  const entry: RegistryConfigEntry = {
    name: server.name,
    _registry_metadata: server as unknown as Record<string, unknown>,
  };

  // Handle remote servers first (they take precedence)
  if (server.remotes && server.remotes.length > 0) {
    const remote = server.remotes[0];
    entry.transport = remote.type;
    entry.url = remote.url;
    if (remote.headers) {
      entry.headers = remote.headers;
    }
    return entry;
  }

  // Handle package-based servers
  if (server.packages && server.packages.length > 0) {
    const pkg = server.packages[0];

    switch (pkg.registry_type) {
      case 'npm':
        entry.command = pkg.runtime_hint || 'npx';
        entry.args = ['-y', pkg.identifier, ...(pkg.package_arguments || [])];
        break;
      case 'pypi':
        entry.command = 'uvx';
        entry.args = [pkg.identifier, ...(pkg.package_arguments || [])];
        break;
      case 'oci':
        entry.command = 'docker';
        entry.args = ['run', '-i', '--rm', pkg.identifier];
        break;
      case 'github':
        // GitHub packages are not supported in MVP - return raw metadata
        break;
      default:
        // Fallback for unknown registry types
        break;
    }

    // Convert environment variables from array to object format
    if (pkg.environment_variables && pkg.environment_variables.length > 0) {
      entry.env = {};
      for (const envVar of pkg.environment_variables) {
        entry.env[envVar.name] = envVar.value || '';
      }
    }
  }

  return entry;
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
    lines.push(`"${server.name}": {`);
    lines.push(`  "transport": "${remote.type}",`);
    lines.push(`  "url": "${remote.url}"`);
    if (remote.headers) {
      lines.push('  "headers": {');
      Object.entries(remote.headers).forEach(([key, value], index, arr) => {
        const comma = index < arr.length - 1 ? ',' : '';
        lines.push(`    "${key}": "${value}"${comma}`);
      });
      lines.push('  }');
    }
    lines.push('}');
    lines.push('```');
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
        lines.push('- Internet connection for image pulling');
        break;
      case 'github':
        lines.push('- GitHub packages are not supported in this version');
        lines.push('- Please use alternative installation methods');
        break;
      default:
        lines.push('- Check package documentation for specific requirements');
        break;
    }

    lines.push('');
    lines.push('## Configuration');
    lines.push('Add the following to your MCP client configuration:');
    lines.push('');
    lines.push('```json');
    lines.push(`"${server.name}": {`);

    switch (pkg.registry_type) {
      case 'npm':
        lines.push(`  "command": "${pkg.runtime_hint || 'npx'}",`);
        lines.push(
          `  "args": ["-y", "${pkg.identifier}"${pkg.package_arguments ? ', "' + pkg.package_arguments.join('", "') + '"' : ''}]`,
        );
        break;
      case 'pypi':
        lines.push('  "command": "uvx",');
        lines.push(
          `  "args": ["${pkg.identifier}"${pkg.package_arguments ? ', "' + pkg.package_arguments.join('", "') + '"' : ''}]`,
        );
        break;
      case 'oci':
        lines.push('  "command": "docker",');
        lines.push(`  "args": ["run", "-i", "--rm", "${pkg.identifier}"]`);
        break;
      default:
        lines.push('  // Configuration depends on package type');
        break;
    }

    if (pkg.environment_variables && pkg.environment_variables.length > 0) {
      lines.push('  "env": {');
      pkg.environment_variables.forEach((envVar, index, arr) => {
        const comma = index < arr.length - 1 ? ',' : '';
        const value = envVar.value || `"<YOUR_${envVar.name}>"`;
        lines.push(`    "${envVar.name}": ${value}${comma}`);
      });
      lines.push('  }');
    }

    lines.push('}');
    lines.push('```');

    if (
      pkg.environment_variables &&
      pkg.environment_variables.some((env) => env.required)
    ) {
      lines.push('');
      lines.push('## Required Environment Variables');
      lines.push('');
      pkg.environment_variables
        .filter((env) => env.required)
        .forEach((env) => {
          lines.push(
            `- **${env.name}**: ${env.value ? `Default: ${env.value}` : 'Required - please set this value'}`,
          );
        });
    }
  }

  if (!server.remotes && !server.packages) {
    lines.push('No installation method available for this server.');
  }

  return lines.join('\n');
}
