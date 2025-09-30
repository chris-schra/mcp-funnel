import { dirname } from 'path';

import {
  filterEnvVars,
  getDefaultPassthroughEnv,
  resolveSecretsFromConfig,
} from '@mcp-funnel/core';
import type { TargetServer, ProxyConfig } from '@mcp-funnel/schemas';

/**
 * SEAM: Interface for building server environment with different strategies
 */
export interface IServerEnvBuilder {
  build(
    targetServer: TargetServer,
    config: ProxyConfig,
    configPath: string,
  ): Promise<Record<string, string>>;
}

/**
 * Default server environment builder that implements the standard precedence order:
 * 1. Start with filtered process.env if defaultPassthroughEnv is set
 * 2. Apply default secret providers if configured
 * 3. Apply server-specific secret providers
 * 4. Apply server-specific env (highest priority)
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
 * Factory function to create server environment builders
 * SEAM: Can be extended to return different builder implementations
 * based on configuration (e.g., vault-based, AWS Secrets Manager, etc.)
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
 * Builds environment for a server using the configured strategy
 * Uses the default builder unless specified otherwise
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
