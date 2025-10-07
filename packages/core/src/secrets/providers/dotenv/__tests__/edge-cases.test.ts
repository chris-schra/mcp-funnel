import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DotEnvProvider } from '../index.js';
import { createTestDirectory, createTestEnvFile, cleanupTestDirectory } from './test-utils.js';

describe('DotEnvProvider - Edge Cases', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDirectory();
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
  });

  it('should handle complex .env file with all features', async () => {
    // Arrange - This is the example from the requirements
    const envContent = [
      'export DATABASE_URL="postgres://user:pass@host/db\\',
      '?sslmode=require"',
      'API_KEY="multi',
      'line',
      'value"',
      'PATH_WITH_VAR="$HOME/bin:$PATH"',
      'ESCAPED="Value with \\n newline and \\t tab"',
      'HOME=/home/user',
      'PATH=/usr/bin:/bin',
      '# This is a comment',
      '',
      'SIMPLE=simple_value',
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.complex', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      DATABASE_URL: 'postgres://user:pass@host/db?sslmode=require',
      API_KEY: 'multi\nline\nvalue',
      PATH_WITH_VAR: '/home/user/bin:/usr/bin:/bin',
      ESCAPED: 'Value with \n newline and \t tab',
      HOME: '/home/user',
      PATH: '/usr/bin:/bin',
      SIMPLE: 'simple_value',
    });
  });

  it('should handle malformed input gracefully', async () => {
    // Arrange
    const envContent = [
      'VALID_VAR=valid_value',
      'UNCLOSED_QUOTE="unclosed quote',
      'NO_EQUALS_SIGN',
      'EMPTY_KEY==value',
      '=EMPTY_KEY_START',
      'ANOTHER_VALID=another_value',
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.malformed', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert - Should continue parsing valid entries and skip malformed ones
    expect(secrets).toEqual({
      VALID_VAR: 'valid_value',
      UNCLOSED_QUOTE: '"unclosed quote',
      ANOTHER_VALID: 'another_value',
    });
  });
});
