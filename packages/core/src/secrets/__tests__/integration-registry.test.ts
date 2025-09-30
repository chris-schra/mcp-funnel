import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecretManager } from '../secret-manager.js';
import { SecretProviderRegistry } from '../secret-provider-registry.js';
import { DotEnvProvider } from '../providers/dotenv/index.js';
import { ProcessEnvProvider } from '../process-env-provider.js';
import { InlineProvider } from '../inline-provider.js';
import {
  createTestDirectory,
  createTestEnvFile,
  cleanupTestDirectory,
} from './test-utils.js';

describe('SecretManager Integration Tests - Registry Integration', () => {
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

  it('should integrate with SecretProviderRegistry for dynamic provider management', async () => {
    // Set up test data
    process.env = {
      ...originalEnv,
      REGISTRY_SECRET: 'registry-secret',
    };

    const envContent = 'FILE_SECRET=file-secret';
    const envFilePath = createTestEnvFile(testDir, '.env.registry', envContent);

    // Create registry and providers
    const registry = new SecretProviderRegistry();

    const processProvider = new ProcessEnvProvider({
      type: 'process',
      config: { allowlist: ['REGISTRY_SECRET'] },
    });

    const dotenvProvider = new DotEnvProvider({
      path: envFilePath,
    });

    const inlineProvider = new InlineProvider({
      type: 'inline',
      config: {
        values: {
          INLINE_SECRET: 'inline-secret',
        },
      },
    });

    // Register providers
    registry.register('process', processProvider);
    registry.register('dotenv', dotenvProvider);
    registry.register('inline', inlineProvider);

    // Create manager with registry
    const manager = new SecretManager([], registry);

    // Act
    const secrets = await manager.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      REGISTRY_SECRET: 'registry-secret',
      FILE_SECRET: 'file-secret',
      INLINE_SECRET: 'inline-secret',
    });

    // Verify provider names are accessible
    const providerNames = manager.getProviderNames();
    expect(providerNames).toContain('process');
    expect(providerNames).toContain('dotenv');
    expect(providerNames).toContain('inline');
  });

  it('should handle both direct providers and registry providers', async () => {
    // Set up test environment
    process.env = {
      ...originalEnv,
      DIRECT_SECRET: 'direct-secret',
      REGISTRY_SECRET: 'registry-secret',
    };

    // Create registry
    const registry = new SecretProviderRegistry();

    const registryProvider = new ProcessEnvProvider({
      type: 'process',
      config: { allowlist: ['REGISTRY_SECRET'] },
    });

    registry.register('registry-provider', registryProvider);

    // Create direct provider
    const directProvider = new ProcessEnvProvider({
      type: 'process',
      config: { allowlist: ['DIRECT_SECRET'] },
    });

    // Create manager with both direct and registry providers
    const manager = new SecretManager([directProvider], registry);

    // Act
    const secrets = await manager.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      DIRECT_SECRET: 'direct-secret',
      REGISTRY_SECRET: 'registry-secret',
    });
  });
});
