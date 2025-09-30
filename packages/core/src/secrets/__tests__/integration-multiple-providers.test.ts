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

describe('SecretManager Integration Tests - Multiple Provider Types', () => {
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
    const nonExistentPath = `${testDir}/nonexistent.env`;
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
