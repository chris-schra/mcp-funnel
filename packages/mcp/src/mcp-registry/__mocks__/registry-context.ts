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
} from '../types/registry.types.js';
import type { ServerConfig } from '../interfaces/temp-server.interface.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

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

  public async getServerDetails(
    registryId: string,
  ): Promise<RegistryServer | null> {
    return this.serverDetailsMock(registryId);
  }

  public async generateInstallInfo(
    server: RegistryServer,
  ): Promise<RegistryInstallInfo> {
    // Default mock implementation that generates a basic install info
    if (this.generateInstallInfoMock.getMockImplementation()) {
      return this.generateInstallInfoMock(server);
    }

    // Default behavior for tests that don't override this
    const firstPackage = server.packages?.[0];
    const firstRemote = server.remotes?.[0];

    let configSnippet: ServerConfig = { name: server.name };
    let installInstructions = `Installation instructions for ${server.name}`;

    if (firstPackage) {
      // Generate config based on package type
      switch (firstPackage.registry_type) {
        case 'npm':
          configSnippet = {
            name: server.name,
            command: 'npx',
            args: [
              '-y',
              firstPackage.identifier,
              ...(firstPackage.package_arguments || []),
            ],
            env:
              firstPackage.environment_variables?.reduce(
                (acc, env) => {
                  if (env.value) acc[env.name] = env.value;
                  return acc;
                },
                {} as Record<string, string>,
              ) || {},
          };
          installInstructions += `\n\nInstall: npm install -g ${firstPackage.identifier}`;
          break;
        case 'pypi':
          configSnippet = {
            name: server.name,
            command: 'uvx',
            args: [
              firstPackage.identifier,
              ...(firstPackage.package_arguments || []),
            ],
            env:
              firstPackage.environment_variables?.reduce(
                (acc, env) => {
                  if (env.value) acc[env.name] = env.value;
                  return acc;
                },
                {} as Record<string, string>,
              ) || {},
          };
          installInstructions += `\n\nInstall: pip install ${firstPackage.identifier}`;
          break;
        case 'oci':
          configSnippet = {
            name: server.name,
            command: 'docker',
            args: [
              'run',
              '-i',
              '--rm',
              firstPackage.identifier,
              ...(firstPackage.package_arguments || []),
            ],
            env:
              firstPackage.environment_variables?.reduce(
                (acc, env) => {
                  if (env.value) acc[env.name] = env.value;
                  return acc;
                },
                {} as Record<string, string>,
              ) || {},
          };
          installInstructions += `\n\nRun: docker run -i --rm ${firstPackage.identifier}`;
          break;
        default:
          // For unknown registry types, return a basic config with raw metadata
          configSnippet = {
            name: server.name,
          };
          // Store raw metadata in installInstructions since ServerConfig doesn't support it
          installInstructions += `\n\nRaw server metadata:\n${JSON.stringify(server, null, 2)}`;
      }

      // Add required environment variables to install instructions
      const requiredVars =
        firstPackage.environment_variables?.filter((env) => env.is_required) ||
        [];
      if (requiredVars.length > 0) {
        installInstructions += `\n\nRequired environment variables:\n${requiredVars.map((v) => `- ${v.name}`).join('\n')}`;
      }
    } else if (firstRemote) {
      // Generate config for remote servers
      configSnippet = {
        name: server.name,
        transport: firstRemote.type,
        url: firstRemote.url,
        headers:
          firstRemote.headers?.reduce(
            (acc, header) => {
              acc[header.name] = header.value || '';
              return acc;
            },
            {} as Record<string, string>,
          ) || {},
      };
      installInstructions += `\n\nConnect to: ${firstRemote.url}`;
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
