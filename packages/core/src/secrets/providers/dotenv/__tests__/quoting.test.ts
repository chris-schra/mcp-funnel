import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DotEnvProvider } from '../index.js';
import {
  createTestDirectory,
  createTestEnvFile,
  cleanupTestDirectory,
} from './test-utils.js';

describe('DotEnvProvider - Quoting', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDirectory();
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
  });

  it('should handle quoted values with special characters', async () => {
    // Arrange
    const envContent = [
      'QUOTED_SPACES="value with spaces"',
      'QUOTED_EQUALS="key=value"',
      'QUOTED_HASH="value#hash"',
      'SINGLE_QUOTED=\'single with "double" quotes\'',
      'UNQUOTED_HASH=value#comment',
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.quoted', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      QUOTED_SPACES: 'value with spaces',
      QUOTED_EQUALS: 'key=value',
      QUOTED_HASH: 'value#hash',
      SINGLE_QUOTED: 'single with "double" quotes',
      UNQUOTED_HASH: 'value',
    });
  });

  it('should handle multiline values in quotes', async () => {
    // Arrange
    const envContent = [
      'API_KEY="multi',
      'line',
      'value"',
      "DATABASE_URL='single",
      'quoted',
      "multiline'",
    ].join('\n');

    const envFilePath = createTestEnvFile(
      testDir,
      '.env.multiline',
      envContent,
    );
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      API_KEY: 'multi\nline\nvalue',
      DATABASE_URL: 'single\nquoted\nmultiline',
    });
  });
});
