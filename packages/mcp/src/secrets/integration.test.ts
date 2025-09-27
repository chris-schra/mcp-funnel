import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { SecretManager } from './secret-manager.js';
import { SecretProviderRegistry } from './secret-provider-registry.js';
import {
  TestEnvironmentManager,
  SecretManagerBuilder,
  RegistryBuilder,
  cacheHelpers,
  assertionHelpers,
  providerSetup,
} from './integration.test.helpers.js';
import {
  testEnvironments,
  envFileContents,
  inlineConfigs,
  providerFactories,
  expectedResults,
} from './integration.test.fixtures.js';

describe('SecretManager Integration Tests', () => {
  let envManager: TestEnvironmentManager;

  beforeEach(() => {
    envManager = new TestEnvironmentManager();
  });

  afterEach(() => {
    envManager.cleanup();
  });

  describe('Multiple Provider Types Integration', () => {
    it('should resolve secrets from multiple providers with correct precedence', async () => {
      envManager.setupEnvironment(testEnvironments.basic);
      const envFilePath = envManager.createEnvFile(
        '.env.app',
        envFileContents.basic,
      );

      const manager = new SecretManagerBuilder()
        .withProvider(providerFactories.processEnvWithPrefix('APP_'))
        .withProvider(providerFactories.dotEnvFromPath(envFilePath))
        .withProvider(providerFactories.inlineFromConfig(inlineConfigs.basic))
        .build();

      const secrets = await manager.resolveSecrets();
      assertionHelpers.expectSecretsToEqual(
        secrets,
        expectedResults.multipleProviders,
      );
    });

    it('should handle provider failures gracefully in integration', async () => {
      const nonExistentPath = join(envManager.getTestDir(), 'nonexistent.env');
      const providers = providerSetup.createMixedProviders(
        envManager,
        testEnvironments.working,
        nonExistentPath,
      );

      const manager = new SecretManagerBuilder()
        .withProviders(providers)
        .build();
      const secrets = await manager.resolveSecrets();

      assertionHelpers.expectSecretsToEqual(
        secrets,
        expectedResults.gracefulFailure,
      );
    });

    it('should handle complex .env files with variable interpolation in integration', async () => {
      envManager.setupEnvironment(testEnvironments.complex);
      const envFilePath = envManager.createEnvFile(
        '.env.complex',
        envFileContents.complex,
      );

      const manager = new SecretManagerBuilder()
        .withProvider(providerFactories.dotEnvFromPath(envFilePath))
        .build();

      const secrets = await manager.resolveSecrets();
      const expectedPath = process.env.PATH
        ? `/usr/local/app/bin:${process.env.PATH}`
        : '/usr/local/app/bin:';

      assertionHelpers.expectSecretsToEqual(
        secrets,
        expectedResults.complex(expectedPath),
      );
    });
  });

  describe('Registry Integration', () => {
    it('should integrate with SecretProviderRegistry for dynamic provider management', async () => {
      envManager.setupEnvironment({ REGISTRY_SECRET: 'registry-secret' });
      const envFilePath = envManager.createEnvFile(
        '.env.registry',
        'FILE_SECRET=file-secret',
      );

      const registry = new RegistryBuilder()
        .withProvider(
          'process',
          providerFactories.processEnvWithAllowlist(['REGISTRY_SECRET']),
        )
        .withProvider('dotenv', providerFactories.dotEnvFromPath(envFilePath))
        .withProvider(
          'inline',
          providerFactories.inlineFromConfig(inlineConfigs.working),
        )
        .build();

      const manager = new SecretManagerBuilder().withRegistry(registry).build();
      const secrets = await manager.resolveSecrets();

      assertionHelpers.expectSecretsToEqual(secrets, {
        REGISTRY_SECRET: 'registry-secret',
        FILE_SECRET: 'file-secret',
        INLINE_SECRET: 'inline-secret',
      });

      assertionHelpers.expectProviderNames(manager, [
        'process',
        'dotenv',
        'inline',
      ]);
    });

    it('should handle both direct providers and registry providers', async () => {
      envManager.setupEnvironment({
        DIRECT_SECRET: 'direct-secret',
        REGISTRY_SECRET: 'registry-secret',
      });

      const registry = new RegistryBuilder()
        .withProvider(
          'registry-provider',
          providerFactories.processEnvWithAllowlist(['REGISTRY_SECRET']),
        )
        .build();

      const manager = new SecretManagerBuilder()
        .withProvider(
          providerFactories.processEnvWithAllowlist(['DIRECT_SECRET']),
        )
        .withRegistry(registry)
        .build();

      const secrets = await manager.resolveSecrets();
      assertionHelpers.expectSecretsToEqual(secrets, {
        DIRECT_SECRET: 'direct-secret',
        REGISTRY_SECRET: 'registry-secret',
      });
    });
  });

  describe('Caching Integration', () => {
    it('should cache results across multiple resolution calls', async () => {
      envManager.setupEnvironment(testEnvironments.cache);

      const manager = new SecretManagerBuilder()
        .withProvider(providerFactories.processEnvWithAllowlist(['CACHE_TEST']))
        .withCaching(1000)
        .build();

      const { beforeChange, afterChangeWithCache, afterCacheClear } =
        await cacheHelpers.testCacheBehavior(
          manager,
          'CACHE_TEST',
          'cache-value',
          'changed-value',
        );

      expect(beforeChange).toEqual({ CACHE_TEST: 'cache-value' });
      expect(afterChangeWithCache).toEqual({ CACHE_TEST: 'cache-value' }); // Still cached
      expect(afterCacheClear).toEqual({ CACHE_TEST: 'changed-value' }); // New value
    });

    it('should handle cache expiration', async () => {
      envManager.setupEnvironment({ EXPIRE_TEST: 'initial-value' });

      const manager = new SecretManagerBuilder()
        .withProvider(
          providerFactories.processEnvWithAllowlist(['EXPIRE_TEST']),
        )
        .withCaching(1) // Very short TTL
        .build();

      const secrets1 = await manager.resolveSecrets();
      expect(secrets1).toEqual({ EXPIRE_TEST: 'initial-value' });

      await cacheHelpers.waitForCacheExpiration(1);
      process.env.EXPIRE_TEST = 'expired-value';

      const secrets2 = await manager.resolveSecrets();
      expect(secrets2).toEqual({ EXPIRE_TEST: 'expired-value' });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle mixed success and failure scenarios', async () => {
      const providers = [
        ...providerSetup.createMixedProviders(
          envManager,
          { SUCCESS_SECRET: 'success-value' },
          '/dev/null/invalid/path/.env',
          ['SUCCESS_SECRET'], // Allow SUCCESS_SECRET specifically
        ),
        providerFactories.inlineFromConfig(inlineConfigs.fallback),
      ];

      const manager = new SecretManagerBuilder()
        .withProviders(providers)
        .build();
      const secrets = await manager.resolveSecrets();

      assertionHelpers.expectSecretsToEqual(secrets, {
        SUCCESS_SECRET: 'success-value',
        INLINE_SECRET: 'inline-secret',
        FALLBACK_SECRET: 'fallback-value',
      });
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical application configuration scenario', async () => {
      envManager.setupEnvironment(testEnvironments.application);
      const appEnvPath = envManager.createEnvFile(
        '.env.development',
        envFileContents.application,
      );

      const manager = new SecretManagerBuilder()
        .withProvider(
          providerFactories.processEnvWithAllowlist(['NODE_ENV', 'PORT']),
        )
        .withProvider(providerFactories.processEnvWithPrefix('APP_'))
        .withProvider(providerFactories.dotEnvFromPath(appEnvPath))
        .withProvider(
          providerFactories.inlineFromConfig(inlineConfigs.deployment),
        )
        .build();

      const config = await manager.resolveSecrets();
      assertionHelpers.expectSecretsToEqual(
        config,
        expectedResults.application,
      );
    });

    it('should handle microservice configuration with service discovery', async () => {
      envManager.setupEnvironment(testEnvironments.microservice);
      const serviceConfigPath = envManager.createEnvFile(
        '.env.service',
        envFileContents.microservice,
      );

      const manager = new SecretManagerBuilder()
        .withProvider(
          providerFactories.processEnvWithAllowlist([
            'SERVICE_NAME',
            'SERVICE_VERSION',
            'CLUSTER_REGION',
          ]),
        )
        .withProvider(providerFactories.processEnvWithPrefix('SHARED_'))
        .withProvider(providerFactories.dotEnvFromPath(serviceConfigPath))
        .withProvider(providerFactories.inlineFromConfig(inlineConfigs.runtime))
        .build();

      const config = await manager.resolveSecrets();
      assertionHelpers.expectSecretsToEqual(
        config,
        expectedResults.microservice,
      );
    });
  });

  describe('Provider Dynamic Management', () => {
    it('should support adding and removing providers at runtime', async () => {
      envManager.setupEnvironment(testEnvironments.dynamic);

      const manager = new SecretManagerBuilder()
        .withProvider(
          providerFactories.processEnvWithAllowlist(['INITIAL_SECRET']),
        )
        .build();

      let secrets = await manager.resolveSecrets();
      expect(secrets).toEqual({ INITIAL_SECRET: 'initial-value' });

      manager.addProvider(
        providerFactories.processEnvWithAllowlist(['DYNAMIC_SECRET']),
      );
      secrets = await manager.resolveSecrets();
      expect(secrets).toEqual({
        INITIAL_SECRET: 'initial-value',
        DYNAMIC_SECRET: 'dynamic-value',
      });

      const removed = manager.removeProvider('process');
      expect(removed).toBe(true);

      secrets = await manager.resolveSecrets();
      expect(secrets).toEqual({});
    });
  });
});
