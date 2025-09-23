import { dirname } from 'path';
import { filterEnvVars, getDefaultPassthroughEnv } from '../env-filter.js';
import { resolveSecretsFromConfig } from '../secrets/index.js';
import type { TargetServer, ProxyConfig } from '../config.js';
import type { IEnvironmentResolver } from './types.js';

/**
 * Default environment resolver that implements the standard precedence order:
 * 1. Start with filtered process.env if defaultPassthroughEnv is set
 * 2. Apply default secret providers if configured
 * 3. Apply server-specific secret providers
 * 4. Apply server-specific env (highest priority)
 */
export class DefaultEnvironmentResolver implements IEnvironmentResolver {
  async resolve(
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
 * Factory function to create environment resolvers
 * SEAM: Can be extended to return different resolver implementations
 * based on configuration (e.g., vault-based, AWS Secrets Manager, etc.)
 */
export function createEnvironmentResolver(
  type: 'default' | string = 'default',
): IEnvironmentResolver {
  switch (type) {
    case 'default':
      return new DefaultEnvironmentResolver();
    default:
      // SEAM: Future resolver implementations can be added here
      // e.g., 'vault', 'aws-secrets', 'azure-keyvault', etc.
      return new DefaultEnvironmentResolver();
  }
}

/**
 * Helper function to resolve environment for a server
 * Uses the default resolver unless specified otherwise
 */
export async function resolveServerEnvironment(
  targetServer: TargetServer,
  config: ProxyConfig,
  configPath: string,
  resolverType?: string,
): Promise<Record<string, string>> {
  const resolver = createEnvironmentResolver(resolverType);
  return resolver.resolve(targetServer, config, configPath);
}
