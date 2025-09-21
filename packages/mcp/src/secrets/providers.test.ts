import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DotEnvProvider } from './dotenv-provider.js';

// Test setup helpers
function createTestDirectory(): string {
  const testDir = join(
    tmpdir(),
    `providers-real-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  );
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function createTestEnvFile(
  dir: string,
  filename: string,
  content: string,
): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function cleanupTestDirectory(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('DotEnvProvider (Real Files)', () => {
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
    const nonExistentPath = join(testDir, 'nonexistent.env');
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

    const envFilePath = createTestEnvFile(
      testDir,
      '.env.single-escape',
      envContent,
    );
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

    const envFilePath = createTestEnvFile(
      testDir,
      '.env.continuation',
      envContent,
    );
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

  it('should handle variable interpolation', async () => {
    // Arrange
    const envContent = [
      'HOME=/home/user',
      'PATH_WITH_VAR="$HOME/bin:$PATH"',
      'BRACED_VAR="${HOME}/projects"',
      'MIXED_VAR="$HOME/bin:${PATH}"',
      'PATH=/usr/bin:/bin',
    ].join('\n');

    const envFilePath = createTestEnvFile(
      testDir,
      '.env.interpolation',
      envContent,
    );
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      HOME: '/home/user',
      PATH_WITH_VAR: '/home/user/bin:/usr/bin:/bin',
      BRACED_VAR: '/home/user/projects',
      MIXED_VAR: '/home/user/bin:/usr/bin:/bin',
      PATH: '/usr/bin:/bin',
    });
  });

  it('should handle undefined variable references gracefully', async () => {
    // Arrange
    const envContent = [
      'DEFINED_VAR=defined_value',
      'UNDEFINED_REF="Value with $UNDEFINED_VAR reference"',
      'BRACED_UNDEFINED="Value with ${ALSO_UNDEFINED} reference"',
      'MIXED="$DEFINED_VAR and $UNDEFINED_VAR"',
    ].join('\n');

    const envFilePath = createTestEnvFile(
      testDir,
      '.env.undefined',
      envContent,
    );
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      DEFINED_VAR: 'defined_value',
      UNDEFINED_REF: 'Value with  reference',
      BRACED_UNDEFINED: 'Value with  reference',
      MIXED: 'defined_value and ',
    });
  });

  it('should handle circular variable references', async () => {
    // Arrange
    const envContent = [
      'CIRCULAR_A="$CIRCULAR_B"',
      'CIRCULAR_B="$CIRCULAR_A"',
      'SELF_REF="$SELF_REF"',
      'NORMAL_VAR=normal_value',
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.circular', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      CIRCULAR_A: '',
      CIRCULAR_B: '',
      SELF_REF: '',
      NORMAL_VAR: 'normal_value',
    });
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

    const envFilePath = createTestEnvFile(
      testDir,
      '.env.malformed',
      envContent,
    );
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
