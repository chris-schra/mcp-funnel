import { describe, it, expect } from 'vitest';
import { type ProxyConfig, ProxyConfigSchema } from '@mcp-funnel/schemas';
import { normalizeServers } from '../../src/utils/normalizeServers.js';

describe('Secrets Configuration Tests', () => {
  describe('Integration Tests', () => {
    describe('end-to-end flow: config → providers → resolved secrets', () => {
      it('should handle complete configuration with multiple provider types', () => {
        const complexConfig: ProxyConfig = {
          servers: [
            {
              name: 'api-server',
              command: 'node',
              args: ['dist/server.js'],
              env: {
                NODE_ENV: 'production',
              },
              secretProviders: [
                {
                  type: 'dotenv',
                  config: {
                    path: '.env.api',
                  },
                },
                {
                  type: 'process',
                  config: {
                    prefix: 'API_',
                    blocklist: ['API_DEBUG'],
                  },
                },
              ],
            },
            {
              name: 'worker-server',
              command: 'python',
              args: ['-m', 'worker'],
              secretProviders: [
                {
                  type: 'inline',
                  config: {
                    values: {
                      WORKER_ID: 'worker-001',
                      QUEUE_NAME: 'tasks',
                    },
                  },
                },
              ],
            },
          ],
          defaultSecretProviders: [
            {
              type: 'process',
              config: {
                allowlist: ['DATABASE_URL', 'REDIS_URL'],
              },
            },
          ],
          defaultPassthroughEnv: ['PATH', 'HOME', 'USER'],
        };

        const result = ProxyConfigSchema.parse(complexConfig);
        expect(result).toEqual(complexConfig);

        // Validate structure
        expect(result.servers).toHaveLength(2);
        expect(result.defaultSecretProviders).toHaveLength(1);
        expect(result.defaultPassthroughEnv).toHaveLength(3);

        // Validate first server
        const normalizedServers = normalizeServers(result.servers);
        const apiServer = normalizedServers[0];
        expect(apiServer.name).toBe('api-server');
        expect(apiServer.secretProviders).toHaveLength(2);
        expect(apiServer.secretProviders?.[0]?.type).toBe('dotenv');
        expect(apiServer.secretProviders?.[1]?.type).toBe('process');

        // Validate second server
        const workerServer = normalizedServers[1];
        expect(workerServer.name).toBe('worker-server');
        expect(workerServer.secretProviders).toHaveLength(1);
        expect(workerServer.secretProviders?.[0]?.type).toBe('inline');
      });
    });

    describe('multiple providers working together', () => {
      it('should validate configuration with overlapping provider configurations', () => {
        const overlappingConfig: ProxyConfig = {
          servers: [
            {
              name: 'multi-source-server',
              command: 'node',
              args: ['app.js'],
              secretProviders: [
                {
                  type: 'process',
                  config: {
                    prefix: 'PRIMARY_',
                  },
                },
                {
                  type: 'dotenv',
                  config: {
                    path: '.env.override',
                  },
                },
                {
                  type: 'inline',
                  config: {
                    values: {
                      FALLBACK_VALUE: 'default',
                    },
                  },
                },
              ],
            },
          ],
        };

        const result = ProxyConfigSchema.parse(overlappingConfig);
        expect(result).toEqual(overlappingConfig);

        const normalizedServers = normalizeServers(result.servers);
        const server = normalizedServers[0];
        expect(server.secretProviders).toHaveLength(3);

        // Verify provider order is preserved (important for precedence)
        expect(server.secretProviders?.[0]?.type).toBe('process');
        expect(server.secretProviders?.[1]?.type).toBe('dotenv');
        expect(server.secretProviders?.[2]?.type).toBe('inline');
      });
    });

    describe('default providers applied to all servers', () => {
      it('should validate that default providers are available for all servers', () => {
        const configWithDefaults: ProxyConfig = {
          servers: [
            {
              name: 'server-1',
              command: 'node',
              args: ['server1.js'],
            },
            {
              name: 'server-2',
              command: 'python',
              args: ['-m', 'server2'],
              secretProviders: [
                {
                  type: 'inline',
                  config: {
                    values: {
                      SPECIFIC_SECRET: 'value',
                    },
                  },
                },
              ],
            },
          ],
          defaultSecretProviders: [
            {
              type: 'process',
              config: {
                allowlist: ['SHARED_SECRET', 'GLOBAL_CONFIG'],
              },
            },
            {
              type: 'dotenv',
              config: {
                path: '.env.shared',
              },
            },
          ],
        };

        const result = ProxyConfigSchema.parse(configWithDefaults);
        expect(result).toEqual(configWithDefaults);

        expect(result.defaultSecretProviders).toHaveLength(2);
        expect(result.servers).toHaveLength(2);

        // First server has no specific providers but should inherit defaults
        const normalizedServers = normalizeServers(result.servers);
        const server1 = normalizedServers[0];
        expect(server1.secretProviders).toBeUndefined();

        // Second server has specific providers in addition to defaults
        const server2 = normalizedServers[1];
        expect(server2.secretProviders).toHaveLength(1);
      });
    });

    describe('server-specific providers override defaults', () => {
      it('should validate mixed default and server-specific provider scenarios', () => {
        const mixedConfig: ProxyConfig = {
          servers: [
            {
              name: 'default-only-server',
              command: 'echo',
              // No secretProviders - should use defaults only
            },
            {
              name: 'override-server',
              command: 'node',
              args: ['app.js'],
              secretProviders: [
                {
                  type: 'dotenv',
                  config: {
                    path: '.env.override',
                  },
                },
              ],
            },
            {
              name: 'combined-server',
              command: 'python',
              args: ['-m', 'app'],
              secretProviders: [
                {
                  type: 'inline',
                  config: {
                    values: {
                      SERVER_SPECIFIC: 'value',
                    },
                  },
                },
              ],
            },
          ],
          defaultSecretProviders: [
            {
              type: 'process',
              config: {
                prefix: 'DEFAULT_',
              },
            },
          ],
        };

        const result = ProxyConfigSchema.parse(mixedConfig);
        expect(result).toEqual(mixedConfig);

        expect(result.defaultSecretProviders).toHaveLength(1);
        expect(result.servers).toHaveLength(3);

        const normalizedServers = normalizeServers(result.servers);
        const [defaultServer, overrideServer, combinedServer] =
          normalizedServers;

        expect(defaultServer.secretProviders).toBeUndefined();
        expect(overrideServer.secretProviders).toHaveLength(1);
        expect(combinedServer.secretProviders).toHaveLength(1);
      });
    });

    describe('environment variable passthrough with defaultPassthroughEnv', () => {
      it('should validate defaultPassthroughEnv configuration for environment inheritance', () => {
        const passthroughConfig: ProxyConfig = {
          servers: [
            {
              name: 'env-dependent-server',
              command: 'node',
              args: ['app.js'],
              env: {
                CUSTOM_VAR: 'custom-value',
              },
            },
          ],
          defaultPassthroughEnv: [
            'PATH',
            'HOME',
            'USER',
            'NODE_ENV',
            'DEBUG',
            'TERM',
          ],
          defaultSecretProviders: [
            {
              type: 'process',
              config: {
                allowlist: ['SECRET_KEY', 'API_TOKEN'],
              },
            },
          ],
        };

        const result = ProxyConfigSchema.parse(passthroughConfig);
        expect(result).toEqual(passthroughConfig);

        expect(result.defaultPassthroughEnv).toHaveLength(6);
        expect(result.defaultPassthroughEnv).toContain('PATH');
        expect(result.defaultPassthroughEnv).toContain('HOME');
        expect(result.defaultPassthroughEnv).toContain('NODE_ENV');

        const normalizedServers = normalizeServers(result.servers);
        const server = normalizedServers[0];
        expect(server.env).toEqual({ CUSTOM_VAR: 'custom-value' });
      });

      it('should validate complex scenario with all secret features combined', () => {
        const fullFeaturesConfig: ProxyConfig = {
          servers: [
            {
              name: 'full-featured-server',
              command: 'node',
              args: ['--experimental-modules', 'server.mjs'],
              env: {
                NODE_ENV: 'production',
                LOG_LEVEL: 'warn',
              },
              secretProviders: [
                {
                  type: 'dotenv',
                  config: {
                    path: '.env.production',
                    encoding: 'utf-8',
                  },
                },
                {
                  type: 'process',
                  config: {
                    prefix: 'PROD_',
                    allowlist: ['PROD_API_KEY', 'PROD_DB_URL'],
                    blocklist: ['PROD_DEBUG_TOKEN'],
                  },
                },
                {
                  type: 'inline',
                  config: {
                    values: {
                      DEPLOYMENT_ID: 'deploy-123',
                      INSTANCE_TYPE: 'production',
                    },
                  },
                },
              ],
            },
          ],
          defaultSecretProviders: [
            {
              type: 'process',
              config: {
                allowlist: ['GLOBAL_CONFIG', 'SHARED_SECRET'],
              },
            },
          ],
          defaultPassthroughEnv: ['PATH', 'HOME', 'USER', 'TERM', 'LANG', 'TZ'],
          alwaysVisibleTools: ['full-featured-server__status'],
          exposeTools: ['full-featured-server__*'],
        };

        const result = ProxyConfigSchema.parse(fullFeaturesConfig);
        expect(result).toEqual(fullFeaturesConfig);

        // Comprehensive validation
        expect(result.servers).toHaveLength(1);
        expect(result.defaultSecretProviders).toHaveLength(1);
        expect(result.defaultPassthroughEnv).toHaveLength(6);
        expect(result.alwaysVisibleTools).toHaveLength(1);
        expect(result.exposeTools).toHaveLength(1);

        const normalizedServers = normalizeServers(result.servers);
        const server = normalizedServers[0];
        expect(server.secretProviders).toHaveLength(3);
        expect(server.env).toEqual({
          NODE_ENV: 'production',
          LOG_LEVEL: 'warn',
        });
      });
    });
  });
});