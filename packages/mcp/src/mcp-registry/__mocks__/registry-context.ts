/**
 * Mock implementation of RegistryContext for testing.
 *
 * This mock provides the same interface as the real RegistryContext but with
 * controllable behavior for testing scenarios. It follows the Vitest/Jest
 * __mocks__ pattern where the mock automatically replaces the real module
 * when vi.mock() is called.
 */

import { vi } from 'vitest';
import type {
  RegistryServer,
  RegistryInstallInfo,
  Package,
  Remote,
  EnvironmentVariable,
  KeyValueInput,
} from '../types/registry.types.js';
import type { ServerConfig } from '../interfaces/temp-server.interface.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

/**
 * Result type for package/remote config generation.
 */
interface ConfigGenerationResult {
  config: ServerConfig;
  instructions: string;
}

/**
 * Converts environment variables array to a key-value record.
 *
 * @param envVars - Environment variables to convert
 * @returns Record mapping variable names to values
 */
function buildEnvRecord(envVars: EnvironmentVariable[] | undefined): Record<string, string> {
  if (!envVars) return {};
  return envVars.reduce(
    (acc: Record<string, string>, env: EnvironmentVariable) => {
      if (env.value) acc[env.name] = env.value;
      return acc;
    },
    {} as Record<string, string>,
  );
}

/**
 * Builds install instructions for required environment variables.
 *
 * @param pkg - Package containing environment variables
 * @returns Instructions string or empty if no required vars
 */
function buildRequiredVarsInstructions(pkg: Package): string {
  const requiredVars =
    pkg.environment_variables?.filter((env: EnvironmentVariable) => env.is_required) || [];

  if (requiredVars.length === 0) return '';

  return `\n\nRequired environment variables:\n${requiredVars.map((v: EnvironmentVariable) => `- ${v.name}`).join('\n')}`;
}

/**
 * Generates config and instructions for npm packages.
 *
 * @param serverName - Name of the server
 * @param pkg - Package to generate config for
 * @returns Config and instructions
 */
function generateNpmConfig(serverName: string, pkg: Package): ConfigGenerationResult {
  const config: ServerConfig = {
    name: serverName,
    command: 'npx',
    args: ['-y', pkg.identifier, ...(pkg.package_arguments || [])],
    env: buildEnvRecord(pkg.environment_variables),
  };

  const instructions = `\n\nInstall: npm install -g ${pkg.identifier}`;

  return { config, instructions };
}

/**
 * Generates config and instructions for pypi packages.
 *
 * @param serverName - Name of the server
 * @param pkg - Package to generate config for
 * @returns Config and instructions
 */
function generatePypiConfig(serverName: string, pkg: Package): ConfigGenerationResult {
  const config: ServerConfig = {
    name: serverName,
    command: 'uvx',
    args: [pkg.identifier, ...(pkg.package_arguments || [])],
    env: buildEnvRecord(pkg.environment_variables),
  };

  const instructions = `\n\nInstall: pip install ${pkg.identifier}`;

  return { config, instructions };
}

/**
 * Generates config and instructions for OCI (Docker) packages.
 *
 * @param serverName - Name of the server
 * @param pkg - Package to generate config for
 * @returns Config and instructions
 */
function generateOciConfig(serverName: string, pkg: Package): ConfigGenerationResult {
  const config: ServerConfig = {
    name: serverName,
    command: 'docker',
    args: ['run', '-i', '--rm', pkg.identifier, ...(pkg.package_arguments || [])],
    env: buildEnvRecord(pkg.environment_variables),
  };

  const instructions = `\n\nRun: docker run -i --rm ${pkg.identifier}`;

  return { config, instructions };
}

/**
 * Generates config and instructions for package-based servers.
 *
 * @param server - Server metadata
 * @param pkg - Package to generate config for
 * @returns Config and instructions
 */
function generatePackageConfig(server: RegistryServer, pkg: Package): ConfigGenerationResult {
  let result: ConfigGenerationResult;

  switch (pkg.registry_type) {
    case 'npm':
      result = generateNpmConfig(server.name, pkg);
      break;
    case 'pypi':
      result = generatePypiConfig(server.name, pkg);
      break;
    case 'oci':
      result = generateOciConfig(server.name, pkg);
      break;
    default:
      // For unknown registry types, return basic config with raw metadata
      result = {
        config: { name: server.name },
        instructions: `\n\nRaw server metadata:\n${JSON.stringify(server, null, 2)}`,
      };
  }

  const baseInstructions = `Installation instructions for ${server.name}`;
  const requiredVarsInstructions = buildRequiredVarsInstructions(pkg);

  return {
    config: result.config,
    instructions: baseInstructions + result.instructions + requiredVarsInstructions,
  };
}

/**
 * Generates config and instructions for remote servers.
 *
 * @param server - Server metadata
 * @param remote - Remote connection information
 * @returns Config and instructions
 */
function generateRemoteConfig(server: RegistryServer, remote: Remote): ConfigGenerationResult {
  const headers =
    remote.headers?.reduce(
      (acc: Record<string, string>, header: KeyValueInput) => {
        acc[header.name] = header.value || '';
        return acc;
      },
      {} as Record<string, string>,
    ) || {};

  const config: ServerConfig = {
    name: server.name,
    transport: remote.type,
    url: remote.url,
    headers,
  };

  const instructions = `Installation instructions for ${server.name}\n\nConnect to: ${remote.url}`;

  return { config, instructions };
}

/**
 * Mock RegistryContext class that mimics the real implementation's interface.
 *
 * Export as RegistryContext (not MockRegistryContext) so it properly replaces
 * the real class when the module is mocked.
 */
export class RegistryContext {
  public static instance: RegistryContext | null = null;
  private serverDetailsMock = vi.fn();
  private generateInstallInfoMock = vi.fn();

  public static getInstance(_config?: ProxyConfig): RegistryContext {
    if (!RegistryContext.instance) {
      RegistryContext.instance = new RegistryContext();
    }
    return RegistryContext.instance;
  }

  public static reset(): void {
    RegistryContext.instance = null;
  }

  public async getServerDetails(registryId: string): Promise<RegistryServer | null> {
    return this.serverDetailsMock(registryId);
  }

  public async generateInstallInfo(server: RegistryServer): Promise<RegistryInstallInfo> {
    // Default mock implementation that generates a basic install info
    if (this.generateInstallInfoMock.getMockImplementation()) {
      return this.generateInstallInfoMock(server);
    }

    // Default behavior for tests that don't override this
    const firstPackage = server.packages?.[0];
    const firstRemote = server.remotes?.[0];

    let configSnippet: ServerConfig;
    let installInstructions: string;

    if (firstPackage) {
      const result = generatePackageConfig(server, firstPackage);
      configSnippet = result.config;
      installInstructions = result.instructions;
    } else if (firstRemote) {
      const result = generateRemoteConfig(server, firstRemote);
      configSnippet = result.config;
      installInstructions = result.instructions;
    } else {
      // Fallback for servers with no packages or remotes
      configSnippet = { name: server.name };
      installInstructions = `Installation instructions for ${server.name}`;
    }

    return {
      name: server.name,
      description: server.description,
      configSnippet,
      installInstructions,
      tools: server.tools || [],
    };
  }

  // Internal method for tests to control the mock behavior
  public _setServerDetailsMock(mock: ReturnType<typeof vi.fn>): void {
    this.serverDetailsMock = mock;
  }

  // Internal method for tests to control the generateInstallInfo mock
  public _setGenerateInstallInfoMock(mock: ReturnType<typeof vi.fn>): void {
    this.generateInstallInfoMock = mock;
  }
}
