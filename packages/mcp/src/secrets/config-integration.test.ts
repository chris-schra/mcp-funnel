import { describe, it, expect } from 'vitest';
import {
  ProxyConfigSchema,
  TargetServerSchema,
  SecretProviderConfigSchema,
} from '../config.js';
import type { ProxyConfig, TargetServerZod } from '../config.js';
import {
  createBasicServer,
  createServerWithEnv,
  secretProviders,
  complexServerConfig,
  fullFeaturedConfig,
  invalidConfigurations,
} from './test-fixtures.js';
import {
  expectValidSchema,
  expectSchemaError,
  expectValidServer,
  expectValidConfig,
  expectValidProvider,
  assertConfigStructure,
  assertNormalizedServers,
  assertProviderTypes,
} from './test-helpers.js';

describe('Secrets Configuration Tests', () => {
  describe('Config Schema Validation', () => {
    describe('secretProviders field validation', () => {
      it('should validate complete secretProviders configuration', () => {
        const server: TargetServerZod = {
          ...createBasicServer('test-server'),
          secretProviders: [
            secretProviders.dotenv('.env', 'utf-8'),
            secretProviders.process({
              prefix: 'MCP_',
              allowlist: ['API_KEY', 'DATABASE_URL'],
              blocklist: ['DEBUG'],
            }),
            secretProviders.inline({
              TEST_SECRET: 'value123',
              ANOTHER_SECRET: 'value456',
            }),
          ],
        };

        const result = expectValidServer(server);
        assertProviderTypes(result, ['dotenv', 'process', 'inline']);
      });

      it.each([
        ['without secretProviders', undefined],
        ['with empty secretProviders', []],
      ])('should validate server %s', (_, providers) => {
        const server: TargetServerZod = {
          ...createBasicServer('test-server'),
          ...(providers !== undefined && { secretProviders: providers }),
        };

        const result = expectValidServer(server);
        expect(result.secretProviders).toEqual(providers);
      });
    });

    describe('defaultSecretProviders field validation', () => {
      it.each([
        [
          'with providers',
          [
            secretProviders.process({ prefix: 'DEFAULT_' }),
            secretProviders.dotenv('.env.shared'),
          ],
        ],
        ['without providers', undefined],
      ])('should validate config %s', (_, providers) => {
        const config: ProxyConfig = {
          servers: [createBasicServer('test')],
          ...(providers && { defaultSecretProviders: providers }),
        };

        const result = expectValidConfig(config);
        expect(result.defaultSecretProviders).toEqual(providers);
      });
    });

    describe('defaultPassthroughEnv field validation', () => {
      it.each([[['PATH', 'HOME', 'USER', 'NODE_ENV']], [[]], [undefined]])(
        'should validate defaultPassthroughEnv: %j',
        (passthroughEnv) => {
          const config: ProxyConfig = {
            servers: [createBasicServer('test')],
            ...(passthroughEnv !== undefined && {
              defaultPassthroughEnv: passthroughEnv,
            }),
          };

          const result = expectValidConfig(config);
          expect(result.defaultPassthroughEnv).toEqual(passthroughEnv);
        },
      );
    });

    describe('invalid configurations', () => {
      it.each([
        ['invalid provider type', invalidConfigurations.invalidType],
        ['dotenv missing path', invalidConfigurations.dotenvMissingPath],
        ['inline missing values', invalidConfigurations.inlineMissingValues],
        ['process wrong types', invalidConfigurations.processWrongTypes],
        ['mismatched type config', invalidConfigurations.mismatchedTypeConfig],
      ])('should reject %s', (_, invalidConfig) => {
        expectSchemaError(SecretProviderConfigSchema, invalidConfig);
      });
    });

    describe('discriminated union validation', () => {
      it('should validate all provider types correctly', () => {
        const providers = [
          secretProviders.dotenv('.env'),
          secretProviders.process({ prefix: 'MCP_' }),
          secretProviders.inline({ SECRET: 'value' }),
        ];

        providers.forEach((provider) => {
          expectValidProvider(provider);
        });
      });
    });
  });

  describe('Backward Compatibility Tests', () => {
    it.each([
      [
        'env field only',
        {
          env: { NODE_ENV: 'production', API_KEY: 'legacy-key' },
        },
      ],
      [
        'env with secretProviders',
        {
          env: { NODE_ENV: 'production' },
          secretProviders: [secretProviders.dotenv('.env.secrets')],
        },
      ],
    ])('should support %s', (_, config) => {
      const server: TargetServerZod = {
        ...createBasicServer('legacy-server'),
        ...config,
      };

      const result = expectValidServer(server);
      expect(result.env).toEqual(config.env);
    });

    it('should maintain backward compatibility for complete legacy configs', () => {
      const legacyConfig: ProxyConfig = {
        servers: [
          createServerWithEnv('service-a', {
            PORT: '3000',
            NODE_ENV: 'development',
          }),
          createServerWithEnv('service-b', { HOST: '0.0.0.0', PORT: '8000' }),
        ],
        exposeTools: ['service-a__*', 'service-b__health'],
        hideTools: ['service-*__debug'],
        alwaysVisibleTools: ['service-a__status'],
      };

      const result = expectValidConfig(legacyConfig);
      assertConfigStructure(result, 2);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex multi-provider configuration', () => {
      const config: ProxyConfig = {
        servers: [
          complexServerConfig,
          {
            ...createBasicServer('worker-server', 'python'),
            args: ['-m', 'worker'],
            secretProviders: [
              secretProviders.inline({
                WORKER_ID: 'worker-001',
                QUEUE_NAME: 'tasks',
              }),
            ],
          },
        ],
        defaultSecretProviders: [
          secretProviders.process({ allowlist: ['DATABASE_URL', 'REDIS_URL'] }),
        ],
        defaultPassthroughEnv: ['PATH', 'HOME', 'USER'],
      };

      const result = expectValidConfig(config);
      assertConfigStructure(result, 2, 1, 3);

      assertNormalizedServers(result, [
        { index: 0, name: 'api-server', providerCount: 2 },
        { index: 1, name: 'worker-server', providerCount: 1 },
      ]);
    });

    it('should validate provider precedence order', () => {
      const config: ProxyConfig = {
        servers: [
          {
            ...createBasicServer('multi-source-server'),
            secretProviders: [
              secretProviders.process({ prefix: 'PRIMARY_' }),
              secretProviders.dotenv('.env.override'),
              secretProviders.inline({ FALLBACK_VALUE: 'default' }),
            ],
          },
        ],
      };

      const result = expectValidConfig(config);
      assertNormalizedServers(result, [
        { index: 0, name: 'multi-source-server', providerCount: 3 },
      ]);

      const server = result.servers[0];
      assertProviderTypes(server, ['process', 'dotenv', 'inline']);
    });

    it('should handle mixed default and server-specific scenarios', () => {
      const config: ProxyConfig = {
        servers: [
          createBasicServer('default-only'),
          {
            ...createBasicServer('override-server'),
            secretProviders: [secretProviders.dotenv('.env.override')],
          },
          {
            ...createBasicServer('combined-server', 'python'),
            secretProviders: [
              secretProviders.inline({ SERVER_SPECIFIC: 'value' }),
            ],
          },
        ],
        defaultSecretProviders: [
          secretProviders.process({ prefix: 'DEFAULT_' }),
        ],
      };

      const result = expectValidConfig(config);
      assertConfigStructure(result, 3, 1);

      assertNormalizedServers(result, [
        { index: 0, name: 'default-only', providerCount: undefined },
        { index: 1, name: 'override-server', providerCount: 1 },
        { index: 2, name: 'combined-server', providerCount: 1 },
      ]);
    });

    it('should validate complete feature integration', () => {
      const result = expectValidConfig(fullFeaturedConfig);
      assertConfigStructure(result, 1, 1, 6);

      expect(result.alwaysVisibleTools).toHaveLength(1);
      expect(result.exposeTools).toHaveLength(1);
      expect(result.defaultPassthroughEnv).toContain('PATH');

      assertNormalizedServers(result, [
        {
          index: 0,
          name: 'full-featured-server',
          providerCount: 3,
          hasEnv: true,
        },
      ]);

      const server = result.servers[0];
      assertProviderTypes(server, ['dotenv', 'process', 'inline']);
      expect(server.env).toEqual({
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn',
      });
    });
  });
});
