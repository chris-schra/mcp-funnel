import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DotEnvProvider } from '../index.js';
import { createTestDirectory, createTestEnvFile, cleanupTestDirectory } from './test-utils.js';

describe('DotEnvProvider - Escape Sequences', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDirectory();
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
  });

  it('should handle escape sequences in double quotes', async () => {
    // Arrange
    const envContent = [
      'ESCAPED="Value with \\n newline and \\t tab"',
      'BACKSLASH="Value with \\\\ backslash"',
      'QUOTES="Value with \\" double quote"',
      'UNICODE="Unicode \\u0048\\u0065\\u006C\\u006C\\u006F"', // "Hello"
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.escape', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      ESCAPED: 'Value with \n newline and \t tab',
      BACKSLASH: 'Value with \\ backslash',
      QUOTES: 'Value with " double quote',
      UNICODE: 'Unicode Hello',
    });
  });

  it('should handle escape sequences in single quotes (minimal escaping)', async () => {
    // Arrange
    const envContent = [
      "LITERAL='Value with \\n literal backslash n'",
      "ESCAPED_QUOTE='Value with \\' single quote'",
      "BACKSLASH='Value with \\\\ literal backslashes'",
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.single-escape', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      LITERAL: 'Value with \\n literal backslash n',
      ESCAPED_QUOTE: "Value with ' single quote",
      BACKSLASH: 'Value with \\\\ literal backslashes',
    });
  });

  it('should handle backslash line continuations', async () => {
    // Arrange
    const envContent = [
      'DATABASE_URL="postgres://user:pass@host/db\\',
      '?sslmode=require"',
      'LONG_VALUE=first\\',
      'second\\',
      'third',
      'NORMAL=simple_value',
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.continuation', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      DATABASE_URL: 'postgres://user:pass@host/db?sslmode=require',
      LONG_VALUE: 'firstsecondthird',
      NORMAL: 'simple_value',
    });
  });
});
