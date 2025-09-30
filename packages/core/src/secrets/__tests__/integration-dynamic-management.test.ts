import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecretManager } from '../secret-manager.js';
import { ProcessEnvProvider } from '../process-env-provider.js';
import { createTestDirectory, cleanupTestDirectory } from './test-utils.js';

describe('SecretManager Integration Tests - Provider Dynamic Management', () => {
  let testDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = createTestDirectory();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    cleanupTestDirectory(testDir);
  });

  it('should support adding and removing providers at runtime', async () => {
    // Set up initial environment
    process.env = {
      ...originalEnv,
      INITIAL_SECRET: 'initial-value',
      DYNAMIC_SECRET: 'dynamic-value',
    };

    const initialProvider = new ProcessEnvProvider({
      type: 'process',
      config: { allowlist: ['INITIAL_SECRET'] },
    });

    const manager = new SecretManager([initialProvider]);

    // Initial resolution
    let secrets = await manager.resolveSecrets();
    expect(secrets).toEqual({
      INITIAL_SECRET: 'initial-value',
    });

    // Add dynamic provider
    const dynamicProvider = new ProcessEnvProvider({
      type: 'process',
      config: { allowlist: ['DYNAMIC_SECRET'] },
    });

    manager.addProvider(dynamicProvider);

    // Resolution after adding provider
    secrets = await manager.resolveSecrets();
    expect(secrets).toEqual({
      INITIAL_SECRET: 'initial-value',
      DYNAMIC_SECRET: 'dynamic-value',
    });

    // Remove initial provider
    const removed = manager.removeProvider('process');
    expect(removed).toBe(true);

    // Resolution after removing provider
    secrets = await manager.resolveSecrets();
    expect(secrets).toEqual({});
  });
});
