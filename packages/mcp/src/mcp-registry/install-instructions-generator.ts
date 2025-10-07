import { RegistryServer, Package } from './types/registry.types.js';
import {
  getPackageDefaults,
  buildPackageCommand,
  PackageDefaults,
} from './config-snippet-helpers.js';

/**
 * Result of generating command and args configuration lines.
 * @internal
 */
type CommandArgsResult = {
  /** JSON configuration lines for command and args */
  lines: string[];
  /** Flag indicating whether environment variables follow in the config */
  hasEnvVars: boolean;
};

/**
 * Generates command and args JSON lines for install instructions.
 * @param pkg - Package metadata from registry
 * @param defaults - Default command and prefix args for this registry type
 * @returns Object containing generated lines and flag indicating if env vars follow
 * @internal
 */
function generateCommandArgsLines(pkg: Package, defaults: PackageDefaults): CommandArgsResult {
  const { command, args } = buildPackageCommand(pkg, defaults);

  const hasEnvVars = Boolean(
    pkg.environment_variables && pkg.environment_variables.some((env) => env.value !== undefined),
  );

  return {
    lines: [
      `  "command": ${JSON.stringify(command)},`,
      `  "args": ${JSON.stringify(args)}${hasEnvVars ? ',' : ''}`,
    ],
    hasEnvVars,
  };
}

/**
 * Generates header section with server name and description.
 * @param server - Registry server data
 * @returns Array of formatted header lines
 * @internal
 */
function generateHeaderSection(server: RegistryServer): string[] {
  return [`# Installation Instructions for ${server.name}`, '', server.description, ''];
}

/**
 * Generates prerequisite section for package-based installations.
 * @param pkg - Package metadata
 * @returns Array of formatted prerequisite lines
 * @internal
 */
function generatePrerequisitesSection(pkg: Package): string[] {
  const lines: string[] = ['## Prerequisites', ''];

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
  return lines;
}

/**
 * Generates environment variables section for configuration JSON.
 * @param pkg - Package metadata with environment variables
 * @returns Array of formatted environment variable lines
 * @internal
 */
function generateEnvVarsLines(pkg: Package): string[] {
  const lines: string[] = [];

  if (!pkg.environment_variables || pkg.environment_variables.length === 0) {
    return lines;
  }

  const varsWithValues = pkg.environment_variables.filter((env) => env.value !== undefined);

  if (varsWithValues.length === 0) {
    return lines;
  }

  lines.push('  "env": {');
  varsWithValues.forEach((envVar, index, arr) => {
    const comma = index < arr.length - 1 ? ',' : '';
    const value = envVar.value;
    lines.push(`    ${JSON.stringify(envVar.name)}: ${JSON.stringify(value)}${comma}`);
  });
  lines.push('  }');

  return lines;
}

/**
 * Generates required environment variables documentation section.
 * @param pkg - Package metadata with environment variables
 * @returns Array of formatted documentation lines
 * @internal
 */
function generateRequiredEnvVarsSection(pkg: Package): string[] {
  const lines: string[] = [];

  if (!pkg.environment_variables) {
    return lines;
  }

  const requiredVars = pkg.environment_variables.filter((env) => env.is_required);

  if (requiredVars.length === 0) {
    return lines;
  }

  lines.push('');
  const title =
    requiredVars.length === 1 ? 'Required environment variable' : 'Required Environment Variables';
  lines.push(`## ${title}`);
  lines.push('');

  requiredVars.forEach((env) => {
    lines.push(
      `- **${env.name}**: ${env.value ? `Default: ${env.value}` : 'required - please set this value'}`,
    );
  });

  return lines;
}

/**
 * Generates JSON configuration snippet for package-based installations.
 * @param serverName - Name of the server for JSON key
 * @param pkg - Package metadata
 * @returns Array of formatted configuration lines
 * @internal
 */
function generatePackageConfigSection(serverName: string, pkg: Package): string[] {
  const lines: string[] = [
    '## Configuration',
    'Add the following to your MCP client configuration:',
    '',
    '```json',
    `${JSON.stringify(serverName)}: {`,
  ];

  const defaults = getPackageDefaults(pkg.registry_type);
  if (defaults) {
    const result = generateCommandArgsLines(pkg, defaults);
    lines.push(...result.lines);
  } else {
    lines.push(`  // Configuration depends on package type for ${pkg.identifier}`);
  }

  lines.push(...generateEnvVarsLines(pkg));
  lines.push('}');
  lines.push('```');

  return lines;
}

/**
 * Generates installation instructions for package-based servers.
 * @param server - Registry server with package configuration
 * @returns Array of formatted instruction lines
 * @internal
 */
function generatePackageInstructions(server: RegistryServer): string[] {
  if (!server.packages || server.packages.length === 0) {
    return [];
  }

  const pkg = server.packages[0];
  const lines: string[] = [];

  lines.push(...generatePrerequisitesSection(pkg));
  lines.push(...generatePackageConfigSection(server.name, pkg));
  lines.push(...generateRequiredEnvVarsSection(pkg));

  return lines;
}

/**
 * Generates authentication notes for remote servers with headers.
 * @returns Array of formatted authentication note lines
 * @internal
 */
function generateAuthenticationNotes(): string[] {
  return [
    '',
    '### Authentication',
    'This server requires authentication tokens or API keys in the headers. Make sure to:',
    '- Replace placeholder values (e.g., ${API_TOKEN}) with actual credentials',
    '- Keep authentication tokens secure and do not commit them to version control',
  ];
}

/**
 * Generates installation instructions for remote servers.
 * @param server - Registry server with remote configuration
 * @returns Array of formatted instruction lines
 * @internal
 */
function generateRemoteInstructions(server: RegistryServer): string[] {
  if (!server.remotes || server.remotes.length === 0) {
    return [];
  }

  const remote = server.remotes[0];
  const hasHeaders = Boolean(remote.headers && remote.headers.length > 0);

  const lines: string[] = [
    '## Remote Server Setup',
    '',
    'This server runs remotely and does not require local installation.',
    '',
    '### Configuration',
    'Add the following to your MCP client configuration:',
    '',
    '```json',
    `${JSON.stringify(server.name)}: {`,
    `  "transport": ${JSON.stringify(remote.type)},`,
    `  "url": ${JSON.stringify(remote.url)}${hasHeaders ? ',' : ''}`,
  ];

  if (hasHeaders && remote.headers) {
    lines.push('  "headers": {');
    remote.headers.forEach((header, index, arr) => {
      const comma = index < arr.length - 1 ? ',' : '';
      lines.push(
        `    ${JSON.stringify(header.name)}: ${JSON.stringify(header.value ?? '')}${comma}`,
      );
    });
    lines.push('  }');
  }

  lines.push('}');
  lines.push('```');

  if (remote.headers && remote.headers.length > 0) {
    lines.push(...generateAuthenticationNotes());
  }

  return lines;
}

/**
 * Generates human-readable installation instructions for a server.
 *
 * Creates comprehensive markdown-formatted instructions including prerequisites,
 * configuration snippets, and authentication notes. Handles both package-based
 * and remote server types.
 * @param server - Registry server data to generate instructions for
 * @returns Markdown-formatted installation instructions
 * @example
 * ```typescript
 * const instructions = generateInstallInstructions(server);
 * console.log(instructions);
 * // Output includes:
 * // - Server description
 * // - Prerequisites
 * // - JSON configuration snippet
 * // - Required environment variables
 * ```
 * @public
 */
export function generateInstallInstructions(server: RegistryServer): string {
  const lines: string[] = generateHeaderSection(server);

  const remoteLines = generateRemoteInstructions(server);
  if (remoteLines.length > 0) {
    lines.push(...remoteLines);
    return lines.join('\n');
  }

  const packageLines = generatePackageInstructions(server);
  if (packageLines.length > 0) {
    lines.push(...packageLines);
    return lines.join('\n');
  }

  lines.push('No installation method available for this server.');
  return lines.join('\n');
}
