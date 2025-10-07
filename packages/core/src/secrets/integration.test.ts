/* eslint-disable max-lines */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecretManager } from './secret-manager.js';
import { SecretProviderRegistry } from './secret-provider-registry.js';
import { DotEnvProvider } from './providers/dotenv/index.js';
import { ProcessEnvProvider } from './process-env-provider.js';
import { InlineProvider } from './inline-provider.js';

// Test setup helpers
/**
 * Creates temporary test directory.
 * @returns Absolute path to created directory
 */
function createTestDirectory(): string {
  const testDir = join(
    tmpdir(),
    `integration-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  );
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

/**
 * Creates test environment file with specified content.
 * @param dir - Parent directory path
 * @param filename - Name of file to create
 * @param content - File content string
 * @returns Absolute path to created file
 */
function createTestEnvFile(dir: string, filename: string, content: string): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Removes test directory and all contents.
 * @param dir - Directory path to remove
 */
function cleanupTestDirectory(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('SecretManager Integration Tests', () => {
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

  describe('Multiple Provider Types Integration', () => {
    it('should resolve secrets from multiple providers with correct precedence', async () => {
      // Set up test environment
      process.env = {
        ...originalEnv,
        APP_API_KEY: 'env-api-key',
        APP_DATABASE_URL: 'env-database-url',
        APP_DEBUG: 'true',
      };

      // Create .env file that overrides some env vars
      const envContent = [
        'API_KEY=file-api-key', // Will override APP_API_KEY from process env
        'SECRET_TOKEN=file-secret-token', // Only in file
        'CONFIG=file-config',
      ].join('\n');
      const envFilePath = createTestEnvFile(testDir, '.env.app', envContent);

      // Create providers
      const processProvider = new ProcessEnvProvider({
        type: 'process',
        config: { prefix: 'APP_' },
      });

      const dotenvProvider = new DotEnvProvider({
        path: envFilePath,
      });

      const inlineProvider = new InlineProvider({
        type: 'inline',
        config: {
          values: {
            API_KEY: 'inline-api-key', // Will override all others
            DEPLOYMENT_ID: 'deploy-123', // Only in inline
          },
        },
      });

      // Create manager with providers in precedence order
      const manager = new SecretManager([
        processProvider, // First (lowest precedence)
        dotenvProvider, // Second (medium precedence)
        inlineProvider, // Third (highest precedence)
      ]);

      // Act
      const secrets = await manager.resolveSecrets();

      // Assert
      expect(secrets).toEqual({
        API_KEY: 'inline-api-key', // Inline provider wins
        DATABASE_URL: 'env-database-url', // Only in process provider
        DEBUG: 'true', // Only in process provider
        SECRET_TOKEN: 'file-secret-token', // Only in dotenv provider
        CONFIG: 'file-config', // Only in dotenv provider
        DEPLOYMENT_ID: 'deploy-123', // Only in inline provider
      });
    });

    it('should handle provider failures gracefully in integration', async () => {
      // Set up test environment
      process.env = {
        ...originalEnv,
        WORKING_API_KEY: 'working-api-key',
        WORKING_CONFIG: 'working-config',
      };

      // Create working providers
      const workingProcessProvider = new ProcessEnvProvider({
        type: 'process',
        config: { prefix: 'WORKING_' },
      });

      // Create failing dotenv provider (non-existent file that will throw)
      const nonExistentPath = join(testDir, 'nonexistent.env');
      const failingDotenvProvider = new DotEnvProvider({
        path: nonExistentPath,
      });

      const workingInlineProvider = new InlineProvider({
        type: 'inline',
        config: {
          values: {
            INLINE_SECRET: 'inline-secret',
          },
        },
      });

      // Create manager with mixed working/failing providers
      const manager = new SecretManager([
        workingProcessProvider,
        failingDotenvProvider, // This will fail gracefully
        workingInlineProvider,
      ]);

      // Act
      const secrets = await manager.resolveSecrets();

      // Assert - should get secrets from working providers only
      expect(secrets).toEqual({
        API_KEY: 'working-api-key',
        CONFIG: 'working-config',
        INLINE_SECRET: 'inline-secret',
      });
    });

    it('should handle complex .env files with variable interpolation in integration', async () => {
      // Set up base environment
      process.env = {
        ...originalEnv,
        BASE_PATH: '/usr/local',
        DB_HOST: 'localhost',
      };

      // Create complex .env file with interpolation
      const envContent = [
        'export APP_HOME="$BASE_PATH/app"',
        'DATABASE_URL="postgres://user:pass@$DB_HOST:5432/myapp"',
        'PATH_WITH_HOME="$APP_HOME/bin:$PATH"',
        'API_KEY="secret',
        'with',
        'newlines"',
        'ESCAPED_VALUE="Value with \\n newline and \\t tab"',
        '# This is a comment',
        'SIMPLE_VALUE=simple',
      ].join('\n');
      const envFilePath = createTestEnvFile(testDir, '.env.complex', envContent);

      const dotenvProvider = new DotEnvProvider({
        path: envFilePath,
      });

      const manager = new SecretManager([dotenvProvider]);

      // Act
      const secrets = await manager.resolveSecrets();

      // Assert
      const expectedPath = process.env.PATH
        ? `/usr/local/app/bin:${process.env.PATH}`
        : '/usr/local/app/bin:';

      expect(secrets).toEqual({
        APP_HOME: '/usr/local/app',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/myapp',
        PATH_WITH_HOME: expectedPath,
        API_KEY: 'secret\nwith\nnewlines',
        ESCAPED_VALUE: 'Value with \n newline and \t tab',
        SIMPLE_VALUE: 'simple',
      });
    });
  });

  describe('Registry Integration', () => {
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

  describe('Caching Integration', () => {
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

  describe('Error Handling Integration', () => {
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

  describe('Real-world Scenarios', () => {
    it('should handle typical application configuration scenario', async () => {
      // Simulate typical app environment
      process.env = {
        ...originalEnv,
        NODE_ENV: 'development',
        PORT: '3000',
        APP_API_KEY: 'env-api-key',
        APP_DATABASE_HOST: 'localhost',
        APP_DEBUG: 'true',
      };

      // Create app-specific .env file
      const appEnvContent = [
        '# Application secrets',
        'API_KEY=development-api-key', // Override env var
        'DATABASE_URL=postgres://user:pass@$APP_DATABASE_HOST:5432/myapp',
        'SECRET_KEY=super-secret-key',
        'REDIS_URL=redis://localhost:6379',
        '',
        '# Feature flags',
        'FEATURE_NEW_UI=true',
        'FEATURE_ANALYTICS=false',
      ].join('\n');
      const appEnvPath = createTestEnvFile(testDir, '.env.development', appEnvContent);

      // Create deployment-specific overrides
      const deploymentOverrides = new InlineProvider({
        type: 'inline',
        config: {
          values: {
            DEPLOYMENT_ID: 'dev-deployment-123',
            BUILD_VERSION: '1.2.3-dev',
            LOG_LEVEL: 'debug',
          },
        },
      });

      // Set up providers in order of precedence
      const envProvider = new ProcessEnvProvider({
        type: 'process',
        config: { prefix: 'APP_' },
      });

      const nodeEnvProvider = new ProcessEnvProvider({
        type: 'process',
        config: { allowlist: ['NODE_ENV', 'PORT'] },
      });

      const appConfigProvider = new DotEnvProvider({
        path: appEnvPath,
      });

      const manager = new SecretManager([
        nodeEnvProvider, // Base environment
        envProvider, // App-specific env vars
        appConfigProvider, // App config file (overrides env)
        deploymentOverrides, // Deployment-specific (highest precedence)
      ]);

      // Act
      const config = await manager.resolveSecrets();

      // Assert
      expect(config).toEqual({
        NODE_ENV: 'development',
        PORT: '3000',
        API_KEY: 'development-api-key', // File overrides env
        DATABASE_HOST: 'localhost',
        DEBUG: 'true',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/myapp',
        SECRET_KEY: 'super-secret-key',
        REDIS_URL: 'redis://localhost:6379',
        FEATURE_NEW_UI: 'true',
        FEATURE_ANALYTICS: 'false',
        DEPLOYMENT_ID: 'dev-deployment-123',
        BUILD_VERSION: '1.2.3-dev',
        LOG_LEVEL: 'debug',
      });
    });

    it('should handle microservice configuration with service discovery', async () => {
      // Simulate microservice environment
      process.env = {
        ...originalEnv,
        SERVICE_NAME: 'user-service',
        SERVICE_VERSION: '2.1.0',
        CLUSTER_REGION: 'us-west-2',
        SHARED_DB_HOST: 'shared-db.internal',
        SHARED_REDIS_HOST: 'shared-redis.internal',
      };

      // Shared infrastructure secrets
      const sharedInfraProvider = new ProcessEnvProvider({
        type: 'process',
        config: { prefix: 'SHARED_' },
      });

      // Service metadata
      const serviceMetadataProvider = new ProcessEnvProvider({
        type: 'process',
        config: {
          allowlist: ['SERVICE_NAME', 'SERVICE_VERSION', 'CLUSTER_REGION'],
        },
      });

      // Service-specific configuration
      const serviceConfigContent = [
        'PORT=8080',
        'API_VERSION=v2',
        'DATABASE_URL=postgres://user:pass@$SHARED_DB_HOST:5432/users',
        'REDIS_URL=redis://$SHARED_REDIS_HOST:6379/0',
        'MAX_CONNECTIONS=100',
        'TIMEOUT_MS=5000',
      ].join('\n');
      const serviceConfigPath = createTestEnvFile(testDir, '.env.service', serviceConfigContent);

      const serviceConfigProvider = new DotEnvProvider({
        path: serviceConfigPath,
      });

      // Runtime secrets (highest precedence)
      const runtimeSecretsProvider = new InlineProvider({
        type: 'inline',
        config: {
          values: {
            JWT_SECRET: 'runtime-jwt-secret',
            ENCRYPTION_KEY: 'runtime-encryption-key',
            API_RATE_LIMIT: '1000',
          },
        },
      });

      const manager = new SecretManager([
        serviceMetadataProvider, // Service identity
        sharedInfraProvider, // Shared infrastructure
        serviceConfigProvider, // Service configuration
        runtimeSecretsProvider, // Runtime secrets
      ]);

      // Act
      const config = await manager.resolveSecrets();

      // Assert
      expect(config).toEqual({
        SERVICE_NAME: 'user-service',
        SERVICE_VERSION: '2.1.0',
        CLUSTER_REGION: 'us-west-2',
        DB_HOST: 'shared-db.internal',
        REDIS_HOST: 'shared-redis.internal',
        PORT: '8080',
        API_VERSION: 'v2',
        DATABASE_URL: 'postgres://user:pass@shared-db.internal:5432/users',
        REDIS_URL: 'redis://shared-redis.internal:6379/0',
        MAX_CONNECTIONS: '100',
        TIMEOUT_MS: '5000',
        JWT_SECRET: 'runtime-jwt-secret',
        ENCRYPTION_KEY: 'runtime-encryption-key',
        API_RATE_LIMIT: '1000',
      });
    });
  });

  describe('Provider Dynamic Management', () => {
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
});
