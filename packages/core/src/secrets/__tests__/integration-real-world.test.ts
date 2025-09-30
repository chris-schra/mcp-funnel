import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecretManager } from '../secret-manager.js';
import { DotEnvProvider } from '../providers/dotenv/index.js';
import { ProcessEnvProvider } from '../process-env-provider.js';
import { InlineProvider } from '../inline-provider.js';
import {
  createTestDirectory,
  createTestEnvFile,
  cleanupTestDirectory,
} from './test-utils.js';

describe('SecretManager Integration Tests - Real-world Scenarios', () => {
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
    const appEnvPath = createTestEnvFile(
      testDir,
      '.env.development',
      appEnvContent,
    );

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
    const serviceConfigPath = createTestEnvFile(
      testDir,
      '.env.service',
      serviceConfigContent,
    );

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
