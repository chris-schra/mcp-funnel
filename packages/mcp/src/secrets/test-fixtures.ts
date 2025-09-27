import type { ProxyConfig, TargetServerZod } from '../config.js';
import type { SecretProviderConfig } from './provider-configs.js';

// Common server configurations
export const createBasicServer = (
  name: string,
  command = 'node',
): TargetServerZod => ({
  name,
  command,
  args: command === 'node' ? ['server.js'] : [],
});

export const createServerWithEnv = (
  name: string,
  env: Record<string, string>,
): TargetServerZod => ({
  ...createBasicServer(name),
  env,
});

// Secret provider fixtures
export const secretProviders = {
  dotenv: (path = '.env', encoding?: string): SecretProviderConfig => ({
    type: 'dotenv',
    config: { path, ...(encoding && { encoding }) },
  }),

  process: (options?: {
    prefix?: string;
    allowlist?: string[];
    blocklist?: string[];
  }): SecretProviderConfig => ({
    type: 'process',
    config: options || {},
  }),

  inline: (values: Record<string, string>): SecretProviderConfig => ({
    type: 'inline',
    config: { values },
  }),
};

// Complex configurations
export const complexServerConfig: TargetServerZod = {
  name: 'api-server',
  command: 'node',
  args: ['dist/server.js'],
  env: { NODE_ENV: 'production' },
  secretProviders: [
    secretProviders.dotenv('.env.api'),
    secretProviders.process({ prefix: 'API_', blocklist: ['API_DEBUG'] }),
  ],
};

export const fullFeaturedConfig: ProxyConfig = {
  servers: [
    {
      name: 'full-featured-server',
      command: 'node',
      args: ['--experimental-modules', 'server.mjs'],
      env: { NODE_ENV: 'production', LOG_LEVEL: 'warn' },
      secretProviders: [
        secretProviders.dotenv('.env.production', 'utf-8'),
        secretProviders.process({
          prefix: 'PROD_',
          allowlist: ['PROD_API_KEY', 'PROD_DB_URL'],
          blocklist: ['PROD_DEBUG_TOKEN'],
        }),
        secretProviders.inline({
          DEPLOYMENT_ID: 'deploy-123',
          INSTANCE_TYPE: 'production',
        }),
      ],
    },
  ],
  defaultSecretProviders: [
    secretProviders.process({ allowlist: ['GLOBAL_CONFIG', 'SHARED_SECRET'] }),
  ],
  defaultPassthroughEnv: ['PATH', 'HOME', 'USER', 'TERM', 'LANG', 'TZ'],
  alwaysVisibleTools: ['full-featured-server__status'],
  exposeTools: ['full-featured-server__*'],
};

// Invalid configuration fixtures for error testing
export const invalidConfigurations = {
  invalidType: { type: 'invalid-type', config: {} },
  dotenvMissingPath: { type: 'dotenv', config: { encoding: 'utf-8' } },
  inlineMissingValues: { type: 'inline', config: {} },
  processWrongTypes: {
    type: 'process',
    config: { prefix: 123, allowlist: 'not-an-array' },
  },
  mismatchedTypeConfig: {
    type: 'dotenv',
    config: { values: { SECRET: 'value' } },
  },
};
