/**
 * Utility functions for generating server configurations from registry data.
 *
 * This module contains functions for converting registry server data into
 * standardized ServerConfig and RegistryInstallInfo formats.
 * @public
 */

import type {
  RegistryServer,
  RegistryInstallInfo,
} from './types/registry.types.js';
import type { ServerConfig } from './types/config.types.js';
import {
  generateConfigSnippet,
  generateInstallInstructions,
} from './config-generator.js';
import { convertHeaders } from './registry-utils.js';

/**
 * Generates a server configuration from registry server data.
 *
 * Converts registry server metadata into a standardized ServerConfig that can
 * be used for server spawning or configuration persistence.
 * @param server - Registry server data to convert
 * @returns Server configuration ready for use
 * @example
 * ```typescript
 * const registryServer = await client.getServer('github-mcp-server');
 * if (registryServer) {
 *   const config = await generateServerConfigFromRegistry(registryServer);
 *   // config is now a ServerConfig ready for use
 * }
 * ```
 * @public
 */
export async function generateServerConfigFromRegistry(
  server: RegistryServer,
): Promise<ServerConfig> {
  console.info(
    `[RegistryConfigUtils] Generating config for server: ${server.name}`,
  );

  const configEntry = generateConfigSnippet(server);

  // Convert RegistryConfigEntry to ServerConfig by extracting core fields
  const serverConfig: ServerConfig = {
    name: configEntry.name,
    command: configEntry.command,
    args: configEntry.args,
    env: configEntry.env,
    transport: configEntry.transport,
    url: configEntry.url,
    headers: convertHeaders(configEntry.headers),
  };

  return serverConfig;
}

/**
 * Generates comprehensive installation information for a server.
 *
 * Provides everything needed to install and configure a server, including
 * the configuration snippet and human-readable installation instructions.
 * @param server - Registry server to generate install info for
 * @returns Complete installation information
 * @example
 * ```typescript
 * const registryServer = await client.getServer('github-mcp-server');
 * if (registryServer) {
 *   const installInfo = await generateInstallInfoFromRegistry(registryServer);
 *   console.log(installInfo.installInstructions);
 * }
 * ```
 * @public
 */
export async function generateInstallInfoFromRegistry(
  server: RegistryServer,
): Promise<RegistryInstallInfo> {
  console.info(
    `[RegistryConfigUtils] Generating install info for server: ${server.name}`,
  );

  const registryConfigEntry = generateConfigSnippet(server);
  const installInstructions = generateInstallInstructions(server);

  // Convert RegistryConfigEntry to ServerConfig for configSnippet
  const configSnippet: ServerConfig = {
    name: registryConfigEntry.name,
    command: registryConfigEntry.command,
    args: registryConfigEntry.args,
    env: registryConfigEntry.env,
    transport: registryConfigEntry.transport,
    url: registryConfigEntry.url,
    headers: convertHeaders(registryConfigEntry.headers),
  };

  return {
    name: server.name,
    description: server.description,
    configSnippet,
    installInstructions,
    tools: server.tools,
  };
}
