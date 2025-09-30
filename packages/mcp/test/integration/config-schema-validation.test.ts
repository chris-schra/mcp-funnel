import { describe, it, expect } from 'vitest';
import {
  type ProxyConfig,
  ProxyConfigSchema,
  SecretProviderConfigSchema,
  TargetServerSchema,
  type TargetServerZod,
} from '@mcp-funnel/schemas';
import type { SecretProviderConfig } from '@mcp-funnel/core';

describe('Secrets Configuration Tests', () => {
  describe('Config Schema Validation', () => {
    describe('secretProviders field in ExtendedTargetServerSchema', () => {
      it('should validate valid secretProviders configuration', () => {
        const validServer: TargetServerZod = {
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
        const serverWithoutSecrets: TargetServerZod = {
          name: 'simple-server',
          command: 'echo',
          args: ['hello'],
        };

        const result = TargetServerSchema.parse(serverWithoutSecrets);
        expect(result).toEqual(serverWithoutSecrets);
        expect(result.secretProviders).toBeUndefined();
      });

      it('should validate empty secretProviders array', () => {
        const serverWithEmptyProviders: TargetServerZod = {
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
});