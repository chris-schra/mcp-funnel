import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecretManager } from '../secret-manager.js';
import { DotEnvProvider } from '../providers/dotenv/index.js';
import { ProcessEnvProvider } from '../process-env-provider.js';
import { InlineProvider } from '../inline-provider.js';
import { createTestDirectory, cleanupTestDirectory } from './test-utils.js';

describe('SecretManager Integration Tests - Error Handling Integration', () => {
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

  it('should handle mixed success and failure scenarios', async () => {
    // Set up test environment
    process.env = {
      ...originalEnv,
      SUCCESS_SECRET: 'success-value',
    };

    // Working provider
    const workingProvider = new ProcessEnvProvider({
      type: 'process',
      config: { allowlist: ['SUCCESS_SECRET'] },
    });

    // Failing provider (will try to read non-existent file with error other than ENOENT)
    const invalidDotenvProvider = new DotEnvProvider({
      path: '/dev/null/invalid/path/.env', // This will cause permission error
    });

    const fallbackProvider = new InlineProvider({
      type: 'inline',
      config: {
        values: {
          FALLBACK_SECRET: 'fallback-value',
        },
      },
    });

    const manager = new SecretManager([
      workingProvider,
      invalidDotenvProvider, // This should fail but not break the manager
      fallbackProvider,
    ]);

    // Act
    const secrets = await manager.resolveSecrets();

    // Assert - should get secrets from working providers
    expect(secrets).toEqual({
      SUCCESS_SECRET: 'success-value',
      FALLBACK_SECRET: 'fallback-value',
    });
  });
});
