import { describe, it, expect } from 'vitest';
import {
  ProxyConfigSchema,
  TargetServerSchema,
  SecretProviderConfigSchema,
  normalizeServers,
} from '../config.js';
import type { ProxyConfig, TargetServer } from '../config.js';
import type { SecretProviderConfig } from './provider-configs.js';

describe('Secrets Configuration Tests', () => {
  describe('Config Schema Validation', () => {
    describe('secretProviders field in TargetServerSchema', () => {
      it('should validate valid secretProviders configuration', () => {
        const validServer: TargetServer = {
          name: 'test-server',
          command: 'node',
          args: ['server.js'],
          secretProviders: [
            {
              type: 'dotenv',
              config: {
                path: '.env',
                encoding: 'utf-8',
              },
            },
            {
              type: 'process',
              config: {
                prefix: 'MCP_',
                allowlist: ['API_KEY', 'DATABASE_URL'],
                blocklist: ['DEBUG'],
              },
            },
            {
              type: 'inline',
              config: {
                values: {
                  TEST_SECRET: 'value123',
                  ANOTHER_SECRET: 'value456',
                },
              },
            },
          ],
        };

        const result = TargetServerSchema.parse(validServer);
        expect(result).toEqual(validServer);
        expect(result.secretProviders).toHaveLength(3);
        expect(result.secretProviders?.[0]?.type).toBe('dotenv');
        expect(result.secretProviders?.[1]?.type).toBe('process');
        expect(result.secretProviders?.[2]?.type).toBe('inline');
      });

      it('should validate server without secretProviders (optional field)', () => {
        const serverWithoutSecrets: TargetServer = {
          name: 'simple-server',
          command: 'echo',
          args: ['hello'],
        };

        const result = TargetServerSchema.parse(serverWithoutSecrets);
        expect(result).toEqual(serverWithoutSecrets);
        expect(result.secretProviders).toBeUndefined();
      });

      it('should validate empty secretProviders array', () => {
        const serverWithEmptyProviders: TargetServer = {
          name: 'empty-providers-server',
          command: 'node',
          secretProviders: [],
        };

        const result = TargetServerSchema.parse(serverWithEmptyProviders);
        expect(result).toEqual(serverWithEmptyProviders);
        expect(result.secretProviders).toEqual([]);
      });
    });

    describe('defaultSecretProviders field in ProxyConfigSchema', () => {
      it('should validate valid defaultSecretProviders configuration', () => {
        const validConfig: ProxyConfig = {
          servers: [
            {
              name: 'test',
              command: 'echo',
            },
          ],
          defaultSecretProviders: [
            {
              type: 'process',
              config: {
                prefix: 'DEFAULT_',
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

        const result = ProxyConfigSchema.parse(validConfig);
        expect(result).toEqual(validConfig);
        expect(result.defaultSecretProviders).toHaveLength(2);
        expect(result.defaultSecretProviders?.[0]?.type).toBe('process');
        expect(result.defaultSecretProviders?.[1]?.type).toBe('dotenv');
      });

      it('should validate config without defaultSecretProviders (optional field)', () => {
        const configWithoutDefaults: ProxyConfig = {
          servers: [
            {
              name: 'test',
              command: 'echo',
            },
          ],
        };

        const result = ProxyConfigSchema.parse(configWithoutDefaults);
        expect(result).toEqual(configWithoutDefaults);
        expect(result.defaultSecretProviders).toBeUndefined();
      });
    });

    describe('defaultPassthroughEnv field in ProxyConfigSchema', () => {
      it('should validate valid defaultPassthroughEnv configuration', () => {
        const validConfig: ProxyConfig = {
          servers: [
            {
              name: 'test',
              command: 'echo',
            },
          ],
          defaultPassthroughEnv: ['PATH', 'HOME', 'USER', 'NODE_ENV'],
        };

        const result = ProxyConfigSchema.parse(validConfig);
        expect(result).toEqual(validConfig);
        expect(result.defaultPassthroughEnv).toEqual([
          'PATH',
          'HOME',
          'USER',
          'NODE_ENV',
        ]);
      });

      it('should validate empty defaultPassthroughEnv array', () => {
        const configWithEmptyPassthrough: ProxyConfig = {
          servers: [
            {
              name: 'test',
              command: 'echo',
            },
          ],
          defaultPassthroughEnv: [],
        };

        const result = ProxyConfigSchema.parse(configWithEmptyPassthrough);
        expect(result).toEqual(configWithEmptyPassthrough);
        expect(result.defaultPassthroughEnv).toEqual([]);
      });

      it('should validate config without defaultPassthroughEnv (optional field)', () => {
        const configWithoutPassthrough: ProxyConfig = {
          servers: [
            {
              name: 'test',
              command: 'echo',
            },
          ],
        };

        const result = ProxyConfigSchema.parse(configWithoutPassthrough);
        expect(result).toEqual(configWithoutPassthrough);
        expect(result.defaultPassthroughEnv).toBeUndefined();
      });
    });

    describe('invalid provider configurations', () => {
      it('should reject invalid provider type', () => {
        const invalidProvider = {
          type: 'invalid-type',
          config: {},
        };

        expect(() => {
          SecretProviderConfigSchema.parse(invalidProvider);
        }).toThrow();
      });

      it('should reject dotenv provider with missing path', () => {
        const invalidDotEnvProvider = {
          type: 'dotenv',
          config: {
            encoding: 'utf-8',
            // missing required path
          },
        };

        expect(() => {
          SecretProviderConfigSchema.parse(invalidDotEnvProvider);
        }).toThrow();
      });

      it('should reject inline provider with missing values', () => {
        const invalidInlineProvider = {
          type: 'inline',
          config: {
            // missing required values
          },
        };

        expect(() => {
          SecretProviderConfigSchema.parse(invalidInlineProvider);
        }).toThrow();
      });

      it('should reject provider with wrong config structure', () => {
        const invalidProviderConfig = {
          type: 'process',
          config: {
            prefix: 123, // should be string
            allowlist: 'not-an-array', // should be array
          },
        };

        expect(() => {
          SecretProviderConfigSchema.parse(invalidProviderConfig);
        }).toThrow();
      });
    });

    describe('discriminated union validation', () => {
      it('should correctly validate discriminated union based on type', () => {
        const dotenvProvider: SecretProviderConfig = {
          type: 'dotenv',
          config: { path: '.env' },
        };

        const processProvider: SecretProviderConfig = {
          type: 'process',
          config: { prefix: 'MCP_' },
        };

        const inlineProvider: SecretProviderConfig = {
          type: 'inline',
          config: { values: { SECRET: 'value' } },
        };

        expect(SecretProviderConfigSchema.parse(dotenvProvider)).toEqual(
          dotenvProvider,
        );
        expect(SecretProviderConfigSchema.parse(processProvider)).toEqual(
          processProvider,
        );
        expect(SecretProviderConfigSchema.parse(inlineProvider)).toEqual(
          inlineProvider,
        );
      });

      it('should reject mismatched type and config combinations', () => {
        const mismatchedProvider = {
          type: 'dotenv',
          config: {
            values: { SECRET: 'value' }, // inline config for dotenv type
          },
        };

        expect(() => {
          SecretProviderConfigSchema.parse(mismatchedProvider);
        }).toThrow();
      });
    });

    describe('default values for defaultPassthroughEnv', () => {
      it('should have expected default behavior for defaultPassthroughEnv', () => {
        const configWithoutPassthrough: ProxyConfig = {
          servers: [
            {
              name: 'test',
              command: 'echo',
            },
          ],
        };

        const result = ProxyConfigSchema.parse(configWithoutPassthrough);

        // When not specified, defaultPassthroughEnv should be undefined
        // The actual default values would be applied at runtime, not in schema
        expect(result.defaultPassthroughEnv).toBeUndefined();
      });
    });
  });

  describe('Backward Compatibility Tests', () => {
    it('should support existing env field without breaking changes', () => {
      const legacyServerConfig: TargetServer = {
        name: 'legacy-server',
        command: 'node',
        args: ['app.js'],
        env: {
          NODE_ENV: 'production',
          API_KEY: 'legacy-key',
          DATABASE_URL: 'postgres://localhost',
        },
      };

      const result = TargetServerSchema.parse(legacyServerConfig);
      expect(result).toEqual(legacyServerConfig);
      expect(result.env).toEqual({
        NODE_ENV: 'production',
        API_KEY: 'legacy-key',
        DATABASE_URL: 'postgres://localhost',
      });
    });

    it('should support env field alongside secretProviders', () => {
      const hybridServerConfig: TargetServer = {
        name: 'hybrid-server',
        command: 'node',
        args: ['app.js'],
        env: {
          NODE_ENV: 'production',
          LOG_LEVEL: 'info',
        },
        secretProviders: [
          {
            type: 'dotenv',
            config: {
              path: '.env.secrets',
            },
          },
        ],
      };

      const result = TargetServerSchema.parse(hybridServerConfig);
      expect(result).toEqual(hybridServerConfig);
      expect(result.env).toBeDefined();
      expect(result.secretProviders).toBeDefined();
      expect(result.secretProviders).toHaveLength(1);
    });

    it('should maintain backward compatibility for configs without any secret providers', () => {
      const oldConfig: ProxyConfig = {
        servers: [
          {
            name: 'old-server',
            command: 'python',
            args: ['-m', 'server'],
            env: {
              PYTHONPATH: '/opt/app',
            },
          },
        ],
        alwaysVisibleTools: ['old-server__legacy_tool'],
      };

      const result = ProxyConfigSchema.parse(oldConfig);
      expect(result).toEqual(oldConfig);
      expect(result.defaultSecretProviders).toBeUndefined();
      expect(result.defaultPassthroughEnv).toBeUndefined();
    });

    it('should validate complete legacy configuration without breaking', () => {
      const fullLegacyConfig: ProxyConfig = {
        servers: [
          {
            name: 'service-a',
            command: 'npm',
            args: ['run', 'start'],
            env: {
              PORT: '3000',
              NODE_ENV: 'development',
            },
          },
          {
            name: 'service-b',
            command: 'python',
            args: ['-m', 'uvicorn', 'main:app'],
            env: {
              HOST: '0.0.0.0',
              PORT: '8000',
            },
          },
        ],
        exposeTools: ['service-a__*', 'service-b__health'],
        hideTools: ['service-*__debug'],
        alwaysVisibleTools: ['service-a__status'],
      };

      const result = ProxyConfigSchema.parse(fullLegacyConfig);
      expect(result).toEqual(fullLegacyConfig);
      expect(result.servers).toHaveLength(2);
    });
  });

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
