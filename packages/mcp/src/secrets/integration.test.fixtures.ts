/**
 * Test fixtures for integration tests.
 * Provides common test data, provider configurations, and environment setups.
 */

import { ProcessEnvProvider } from './process-env-provider.js';
import { DotEnvProvider } from './providers/dotenv/index.js';
import { InlineProvider } from './inline-provider.js';

/**
 * Common environment configurations for testing
 */
export const testEnvironments = {
  basic: {
    APP_API_KEY: 'env-api-key',
    APP_DATABASE_URL: 'env-database-url',
    APP_DEBUG: 'true',
  },

  working: {
    WORKING_API_KEY: 'working-api-key',
    WORKING_CONFIG: 'working-config',
  },

  complex: {
    BASE_PATH: '/usr/local',
    DB_HOST: 'localhost',
  },

  cache: {
    CACHE_TEST: 'cache-value',
  },

  application: {
    NODE_ENV: 'development',
    PORT: '3000',
    APP_API_KEY: 'env-api-key',
    APP_DATABASE_HOST: 'localhost',
    APP_DEBUG: 'true',
  },

  microservice: {
    SERVICE_NAME: 'user-service',
    SERVICE_VERSION: '2.1.0',
    CLUSTER_REGION: 'us-west-2',
    SHARED_DB_HOST: 'shared-db.internal',
    SHARED_REDIS_HOST: 'shared-redis.internal',
  },

  dynamic: {
    INITIAL_SECRET: 'initial-value',
    DYNAMIC_SECRET: 'dynamic-value',
  },
} as const;

/**
 * Common .env file contents for testing
 */
export const envFileContents = {
  basic: [
    'API_KEY=file-api-key',
    'SECRET_TOKEN=file-secret-token',
    'CONFIG=file-config',
  ].join('\n'),

  complex: [
    'export APP_HOME="$BASE_PATH/app"',
    'DATABASE_URL="postgres://user:pass@$DB_HOST:5432/myapp"',
    'PATH_WITH_HOME="$APP_HOME/bin:$PATH"',
    'API_KEY="secret',
    'with',
    'newlines"',
    'ESCAPED_VALUE="Value with \\n newline and \\t tab"',
    '# This is a comment',
    'SIMPLE_VALUE=simple',
  ].join('\n'),

  application: [
    '# Application secrets',
    'API_KEY=development-api-key',
    'DATABASE_URL=postgres://user:pass@$APP_DATABASE_HOST:5432/myapp',
    'SECRET_KEY=super-secret-key',
    'REDIS_URL=redis://localhost:6379',
    '',
    '# Feature flags',
    'FEATURE_NEW_UI=true',
    'FEATURE_ANALYTICS=false',
  ].join('\n'),

  microservice: [
    'PORT=8080',
    'API_VERSION=v2',
    'DATABASE_URL=postgres://user:pass@$SHARED_DB_HOST:5432/users',
    'REDIS_URL=redis://$SHARED_REDIS_HOST:6379/0',
    'MAX_CONNECTIONS=100',
    'TIMEOUT_MS=5000',
  ].join('\n'),
} as const;

/**
 * Common inline provider configurations
 */
export const inlineConfigs = {
  basic: {
    API_KEY: 'inline-api-key',
    DEPLOYMENT_ID: 'deploy-123',
  },

  working: {
    INLINE_SECRET: 'inline-secret',
  },

  fallback: {
    FALLBACK_SECRET: 'fallback-value',
  },

  deployment: {
    DEPLOYMENT_ID: 'dev-deployment-123',
    BUILD_VERSION: '1.2.3-dev',
    LOG_LEVEL: 'debug',
  },

  runtime: {
    JWT_SECRET: 'runtime-jwt-secret',
    ENCRYPTION_KEY: 'runtime-encryption-key',
    API_RATE_LIMIT: '1000',
  },
} as const;

/**
 * Provider factory functions for common configurations
 */
export const providerFactories = {
  processEnvWithPrefix: (prefix: string) =>
    new ProcessEnvProvider({
      type: 'process',
      config: { prefix },
    }),

  processEnvWithAllowlist: (allowlist: string[]) =>
    new ProcessEnvProvider({
      type: 'process',
      config: { allowlist },
    }),

  dotEnvFromPath: (path: string) => new DotEnvProvider({ path }),

  inlineFromConfig: (values: Record<string, string>) =>
    new InlineProvider({
      type: 'inline',
      config: { values },
    }),

  failingDotEnv: (invalidPath: string) =>
    new DotEnvProvider({ path: invalidPath }),
} as const;

/**
 * Expected results for common test scenarios
 */
export const expectedResults = {
  multipleProviders: {
    API_KEY: 'inline-api-key',
    DATABASE_URL: 'env-database-url',
    DEBUG: 'true',
    SECRET_TOKEN: 'file-secret-token',
    CONFIG: 'file-config',
    DEPLOYMENT_ID: 'deploy-123',
  },

  gracefulFailure: {
    API_KEY: 'working-api-key',
    CONFIG: 'working-config',
    INLINE_SECRET: 'inline-secret',
  },

  complex: (expectedPath: string) => ({
    APP_HOME: '/usr/local/app',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/myapp',
    PATH_WITH_HOME: expectedPath,
    API_KEY: 'secret\nwith\nnewlines',
    ESCAPED_VALUE: 'Value with \n newline and \t tab',
    SIMPLE_VALUE: 'simple',
  }),

  application: {
    NODE_ENV: 'development',
    PORT: '3000',
    API_KEY: 'development-api-key',
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
  },

  microservice: {
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
  },
} as const;
