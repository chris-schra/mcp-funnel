import { dirname } from 'path';

import {
  filterEnvVars,
  getDefaultPassthroughEnv,
  resolveSecretsFromConfig,
} from '@mcp-funnel/core';
import type { TargetServer, ProxyConfig } from '@mcp-funnel/schemas';

/**
 * Interface for building server environment with different strategies.
 *
 * SEAM: Allows alternative environment building strategies (e.g., vault-based,
 * AWS Secrets Manager) to be plugged in without changing consumers.
 * @public
 */
export interface IServerEnvBuilder {
  build(
    targetServer: TargetServer,
    config: ProxyConfig,
    configPath: string,
  ): Promise<Record<string, string>>;
}

/**
 * Default server environment builder implementing standard precedence order.
 *
 * Environment variable precedence (last wins):
 * 1. Filtered process.env (using defaultPassthroughEnv or secure defaults)
 * 2. Default secret providers (config.defaultSecretProviders)
 * 3. Server-specific secret providers (targetServer.secretProviders)
 * 4. Server-specific env (targetServer.env) - highest priority
 * @example
 * ```typescript
 * const builder = new DefaultServerEnvBuilder();
 * const env = await builder.build(targetServer, config, '/path/to/config.json');
 * ```
 * @public
 */
export class DefaultServerEnvBuilder implements IServerEnvBuilder {
  public async build(
    targetServer: TargetServer,
    config: ProxyConfig,
    configPath: string,
  ): Promise<Record<string, string>> {
    let finalEnv: Record<string, string> = {};

    // 1. Start with filtered process.env
    // Use configured defaultPassthroughEnv or secure defaults if not specified
    const passthroughEnv =
      config.defaultPassthroughEnv ?? getDefaultPassthroughEnv();
    finalEnv = filterEnvVars(process.env, passthroughEnv);

    // 2. Apply default secret providers if configured
    if (config.defaultSecretProviders) {
      const configDir = dirname(configPath);
      const defaultSecrets = await resolveSecretsFromConfig(
        config.defaultSecretProviders,
        configDir,
        {
          context: { name: targetServer.name, type: 'default secrets' },
        },
      );
      finalEnv = { ...finalEnv, ...defaultSecrets };
    }

    // 3. Apply server-specific secret providers
    if (targetServer.secretProviders) {
      const configDir = dirname(configPath);
      const serverSecrets = await resolveSecretsFromConfig(
        targetServer.secretProviders,
        configDir,
        {
          context: { name: targetServer.name, type: 'server-specific secrets' },
        },
      );
      finalEnv = { ...finalEnv, ...serverSecrets };
    }

    // 4. Apply server-specific env (highest priority)
    if (targetServer.env) {
      finalEnv = { ...finalEnv, ...targetServer.env };
    }

    return finalEnv;
  }
}

/**
 * Creates server environment builders based on type.
 *
 * SEAM: Extension point for alternative builder implementations
 * (e.g., 'vault', 'aws-secrets', 'azure-keyvault').
 * @param {string} [type] - Builder type identifier (currently only 'default' implemented)
 * @returns {IServerEnvBuilder} Environment builder instance
 * @public
 */
export function createServerEnvBuilder(
  type: 'default' | string = 'default',
): IServerEnvBuilder {
  switch (type) {
    case 'default':
      return new DefaultServerEnvBuilder();
    default:
      // SEAM: Future builder implementations can be added here
      // e.g., 'vault', 'aws-secrets', 'azure-keyvault', etc.
      return new DefaultServerEnvBuilder();
  }
}

/**
 * Builds environment variables for a server using the configured strategy.
 * @param {TargetServer} targetServer - Server configuration including env overrides and secret providers
 * @param {ProxyConfig} config - Global proxy configuration with default secret providers
 * @param {string} configPath - Absolute path to config file (for resolving relative secret paths)
 * @param {string} [builderType] - Optional builder type (defaults to 'default')
 * @returns {Promise<Record<string, string>>} Fully resolved environment variable map ready for process spawning
 * @example
 * ```typescript
 * const env = await buildServerEnvironment(
 *   { name: 'github', command: 'gh-server', env: { DEBUG: '1' } },
 *   proxyConfig,
 *   '/path/to/.mcp-funnel.json'
 * );
 * ```
 * @public
 * @see file:./index.ts:28 - DefaultServerEnvBuilder implementation
 */
export async function buildServerEnvironment(
  targetServer: TargetServer,
  config: ProxyConfig,
  configPath: string,
  builderType?: string,
): Promise<Record<string, string>> {
  const builder = createServerEnvBuilder(builderType);
  return builder.build(targetServer, config, configPath);
}
