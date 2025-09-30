import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DotEnvProvider } from '../index.js';
import {
  createTestDirectory,
  createTestEnvFile,
  cleanupTestDirectory,
} from './test-utils.js';

describe('DotEnvProvider - Basic Parsing', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDirectory();
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
  });

  it('should read a valid .env file and parse key-value pairs', async () => {
    // Arrange
    const envContent =
      'API_KEY=secret123\nDATABASE_URL=postgres://localhost:5432/test\n';
    const envFilePath = createTestEnvFile(testDir, '.env', envContent);

    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      API_KEY: 'secret123',
      DATABASE_URL: 'postgres://localhost:5432/test',
    });
  });

  it('should handle missing .env file gracefully', async () => {
    // Arrange - use a non-existent file path
    const nonExistentPath = `${testDir}/nonexistent.env`;
    const provider = new DotEnvProvider({ path: nonExistentPath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({});
  });

  it('should resolve relative paths correctly', async () => {
    // Arrange
    const envContent = 'KEY=value';
    const _envFilePath = createTestEnvFile(testDir, '.env.local', envContent);
    const relativePath = '.env.local';

    const provider = new DotEnvProvider({ path: relativePath }, testDir);

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({ KEY: 'value' });
  });

  it('should handle absolute paths correctly', async () => {
    // Arrange
    const envContent = 'KEY=value';
    const envFilePath = createTestEnvFile(testDir, '.env.absolute', envContent);

    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({ KEY: 'value' });
  });

  it('should parse various key=value formats correctly', async () => {
    // Arrange
    const envContent = [
      'SIMPLE=value',
      'WITH_SPACES=value with spaces',
      'QUOTED="quoted value"',
      "SINGLE_QUOTED='single quoted'",
      'EMPTY_VALUE=',
      'EQUALS_IN_VALUE=key=value=more',
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.formats', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      SIMPLE: 'value',
      WITH_SPACES: 'value with spaces',
      QUOTED: 'quoted value',
      SINGLE_QUOTED: 'single quoted',
      EMPTY_VALUE: '',
      EQUALS_IN_VALUE: 'key=value=more',
    });
  });

  it('should handle comments and empty lines correctly', async () => {
    // Arrange
    const envContent = [
      '# This is a comment',
      '',
      'API_KEY=secret123',
      '# Another comment',
      '   # Indented comment',
      '',
      'DATABASE_URL=postgres://localhost:5432',
      '',
      '# Final comment',
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.comments', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      API_KEY: 'secret123',
      DATABASE_URL: 'postgres://localhost:5432',
    });
  });

  it('should use custom encoding parameter', async () => {
    // Arrange
    const envContent = 'KEY=value';
    const envFilePath = createTestEnvFile(testDir, '.env.encoding', envContent);

    const provider = new DotEnvProvider({
      path: envFilePath,
      encoding: 'latin1',
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({ KEY: 'value' });
    // Note: For UTF-8 compatible content like this, both encodings will work
  });

  it('should handle export statements', async () => {
    // Arrange
    const envContent = [
      'export DATABASE_URL="postgres://user:pass@host/db"',
      'export API_KEY=secret123',
      'NORMAL_VAR=normal_value',
      'export   SPACED_EXPORT=value_with_spaces',
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.export', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      DATABASE_URL: 'postgres://user:pass@host/db',
      API_KEY: 'secret123',
      NORMAL_VAR: 'normal_value',
      SPACED_EXPORT: 'value_with_spaces',
    });
  });
});