import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecretManager } from '../secret-manager.js';
import { ProcessEnvProvider } from '../process-env-provider.js';
import { createTestDirectory, cleanupTestDirectory } from './test-utils.js';

describe('SecretManager Integration Tests - Caching Integration', () => {
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

  it('should cache results across multiple resolution calls', async () => {
    process.env = {
      ...originalEnv,
      CACHE_TEST: 'cache-value',
    };

    const provider = new ProcessEnvProvider({
      type: 'process',
      config: { allowlist: ['CACHE_TEST'] },
    });

    // Enable caching with 1-second TTL
    const manager = new SecretManager([provider], undefined, {
      cacheTtl: 1000,
    });

    // First resolution
    const secrets1 = await manager.resolveSecrets();
    expect(secrets1).toEqual({ CACHE_TEST: 'cache-value' });

    // Change environment (simulating external change)
    process.env.CACHE_TEST = 'changed-value';

    // Second resolution (should use cache)
    const secrets2 = await manager.resolveSecrets();
    expect(secrets2).toEqual({ CACHE_TEST: 'cache-value' }); // Still cached value

    // Clear cache
    manager.clearCache();

    // Third resolution (should re-fetch)
    const secrets3 = await manager.resolveSecrets();
    expect(secrets3).toEqual({ CACHE_TEST: 'changed-value' }); // New value
  });

  it('should handle cache expiration', async () => {
    process.env = {
      ...originalEnv,
      EXPIRE_TEST: 'initial-value',
    };

    const provider = new ProcessEnvProvider({
      type: 'process',
      config: { allowlist: ['EXPIRE_TEST'] },
    });

    // Very short cache TTL (1ms)
    const manager = new SecretManager([provider], undefined, {
      cacheTtl: 1,
    });

    // First resolution
    const secrets1 = await manager.resolveSecrets();
    expect(secrets1).toEqual({ EXPIRE_TEST: 'initial-value' });

    // Wait for cache to expire
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Change environment
    process.env.EXPIRE_TEST = 'expired-value';

    // Second resolution (cache should be expired)
    const secrets2 = await manager.resolveSecrets();
    expect(secrets2).toEqual({ EXPIRE_TEST: 'expired-value' });
  });
});
