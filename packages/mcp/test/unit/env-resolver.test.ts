import { describe, it, expect, beforeEach } from 'vitest';
import type { ProxyConfig, TargetServer } from '@mcp-funnel/schemas';
import { buildServerEnvironment } from '../../src/env/index.js';

const baseConfigPath = new URL('../fixtures/test-config.json', import.meta.url).pathname;

const createConfig = (overrides: Partial<ProxyConfig> = {}): ProxyConfig => ({
  servers: overrides.servers ?? {
    'test-server': {
      command: 'node',
      args: ['test.js'],
    },
  },
  defaultSecretProviders: overrides.defaultSecretProviders,
  ...overrides,
});

describe('buildServerEnvironment', () => {
  beforeEach(() => {
    delete process.env.INLINE_SECRET;
    delete process.env.SERVER_SECRET;
    delete process.env.TEST_TOKEN;
    delete process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN;
  });

  it('merges server env when no secret providers configured', async () => {
    const config = createConfig();
    const server: TargetServer = {
      name: 'test-server',
      command: 'node',
      env: { CUSTOM: 'value' },
    };

    const env = await buildServerEnvironment(server, config, baseConfigPath);

    expect(env.CUSTOM).toBe('value');
  });

  it('includes secrets from default and server providers', async () => {
    const config = createConfig({
      defaultSecretProviders: [
        {
          type: 'inline',
          config: {
            values: { DEFAULT_SECRET: 'default-secret-value' },
          },
        },
      ],
    });

    const server: TargetServer = {
      name: 'test-server',
      command: 'node',
      env: { CUSTOM: 'value' },
      secretProviders: [
        {
          type: 'inline',
          config: {
            values: { SERVER_SECRET: 'server-secret-value' },
          },
        },
      ],
    };

    const env = await buildServerEnvironment(server, config, baseConfigPath);

    expect(env.DEFAULT_SECRET).toBe('default-secret-value');
    expect(env.SERVER_SECRET).toBe('server-secret-value');
    expect(env.CUSTOM).toBe('value');
  });

  describe('environment variable pattern resolution', () => {
    it('resolves ${VAR} patterns in server.env from defaultSecretProviders', async () => {
      const config = createConfig({
        defaultSecretProviders: [
          {
            type: 'inline',
            config: {
              values: { PLAYWRIGHT_MCP_EXTENSION_TOKEN: 'secret-token-12345' },
            },
          },
        ],
      });

      const server: TargetServer = {
        name: 'playwright',
        command: 'npx',
        args: ['@playwright/mcp@latest'],
        env: {
          PLAYWRIGHT_MCP_EXTENSION_TOKEN: '${PLAYWRIGHT_MCP_EXTENSION_TOKEN}',
        },
      };

      const env = await buildServerEnvironment(server, config, baseConfigPath);

      expect(env.PLAYWRIGHT_MCP_EXTENSION_TOKEN).toBe('secret-token-12345');
    });

    it('resolves ${VAR} patterns in server.env from server secretProviders', async () => {
      const config = createConfig();
      const server: TargetServer = {
        name: 'test-server',
        command: 'node',
        env: {
          API_TOKEN: '${TEST_TOKEN}',
        },
        secretProviders: [
          {
            type: 'inline',
            config: {
              values: { TEST_TOKEN: 'server-token-xyz' },
            },
          },
        ],
      };

      const env = await buildServerEnvironment(server, config, baseConfigPath);

      expect(env.API_TOKEN).toBe('server-token-xyz');
    });

    it('resolves ${VAR} patterns in server.env from process.env', async () => {
      process.env.TEST_TOKEN = 'process-env-token';
      const config = createConfig({
        defaultPassthroughEnv: ['TEST_TOKEN'],
      });
      const server: TargetServer = {
        name: 'test-server',
        command: 'node',
        env: {
          API_TOKEN: '${TEST_TOKEN}',
        },
      };

      const env = await buildServerEnvironment(server, config, baseConfigPath);

      expect(env.API_TOKEN).toBe('process-env-token');
    });

    it('resolves ${VAR:default} patterns with default values when var missing', async () => {
      const config = createConfig();
      const server: TargetServer = {
        name: 'test-server',
        command: 'node',
        env: {
          ENV_MODE: '${APP_ENV:production}',
        },
      };

      const env = await buildServerEnvironment(server, config, baseConfigPath);

      expect(env.ENV_MODE).toBe('production');
    });

    it('resolves nested patterns in server.env', async () => {
      const config = createConfig({
        defaultSecretProviders: [
          {
            type: 'inline',
            config: {
              values: {
                BASE_URL: 'https://api.example.com',
                API_VERSION: 'v1',
              },
            },
          },
        ],
      });

      const server: TargetServer = {
        name: 'test-server',
        command: 'node',
        env: {
          FULL_URL: '${BASE_URL}/${API_VERSION}/endpoint',
        },
      };

      const env = await buildServerEnvironment(server, config, baseConfigPath);

      expect(env.FULL_URL).toBe('https://api.example.com/v1/endpoint');
    });

    it('handles multiple pattern variables in single env value', async () => {
      const config = createConfig({
        defaultSecretProviders: [
          {
            type: 'inline',
            config: {
              values: {
                USERNAME: 'admin',
                PASSWORD: 'secret123',
              },
            },
          },
        ],
      });

      const server: TargetServer = {
        name: 'test-server',
        command: 'node',
        env: {
          CONNECTION_STRING: 'user=${USERNAME};pass=${PASSWORD}',
        },
      };

      const env = await buildServerEnvironment(server, config, baseConfigPath);

      expect(env.CONNECTION_STRING).toBe('user=admin;pass=secret123');
    });

    it('preserves literal values without patterns', async () => {
      const config = createConfig();
      const server: TargetServer = {
        name: 'test-server',
        command: 'node',
        env: {
          LITERAL: 'plain-text-value',
          NUMERIC: '12345',
        },
      };

      const env = await buildServerEnvironment(server, config, baseConfigPath);

      expect(env.LITERAL).toBe('plain-text-value');
      expect(env.NUMERIC).toBe('12345');
    });
  });
});
