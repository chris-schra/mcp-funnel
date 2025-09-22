import { describe, it, expect, beforeEach } from 'vitest';
import { resolveServerEnvironment } from '../../src/proxy/env.js';
import type { ProxyConfig, TargetServer } from '../../src/config.js';

const baseConfigPath = new URL('../fixtures/test-config.json', import.meta.url)
  .pathname;

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

describe('resolveServerEnvironment', () => {
  beforeEach(() => {
    delete process.env.INLINE_SECRET;
    delete process.env.SERVER_SECRET;
  });

  it('merges server env when no secret providers configured', async () => {
    const config = createConfig();
    const server: TargetServer = {
      name: 'test-server',
      command: 'node',
      env: { CUSTOM: 'value' },
    };

    const env = await resolveServerEnvironment(server, config, baseConfigPath);

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

    const env = await resolveServerEnvironment(server, config, baseConfigPath);

    expect(env.DEFAULT_SECRET).toBe('default-secret-value');
    expect(env.SERVER_SECRET).toBe('server-secret-value');
    expect(env.CUSTOM).toBe('value');
  });
});
