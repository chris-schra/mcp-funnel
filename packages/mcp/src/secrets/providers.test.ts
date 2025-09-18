import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DotEnvProvider } from './dotenv-provider.js';
import { ProcessEnvProvider } from './process-env-provider.js';
import { InlineProvider } from './inline-provider.js';
import type { ISecretProvider } from './types.js';

// Mock file system operations for DotEnvProvider tests
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('path', () => ({
  resolve: vi.fn(),
  isAbsolute: vi.fn(),
}));

describe('DotEnvProvider', () => {
  let mockReadFileSync: ReturnType<typeof vi.fn>;
  let mockResolve: ReturnType<typeof vi.fn>;
  let mockIsAbsolute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get references to the mocked functions
    const fsMock = await import('fs');
    const pathMock = await import('path');
    mockReadFileSync = vi.mocked(fsMock.readFileSync);
    mockResolve = vi.mocked(pathMock.resolve);
    mockIsAbsolute = vi.mocked(pathMock.isAbsolute);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should read a valid .env file and parse key-value pairs', async () => {
    // Arrange
    const envContent =
      'API_KEY=secret123\nDATABASE_URL=postgres://localhost:5432/test\n';
    mockReadFileSync.mockReturnValue(envContent);
    mockIsAbsolute.mockReturnValue(false);
    mockResolve.mockReturnValue('/resolved/path/.env');

    const provider = new DotEnvProvider({ path: '.env' });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      API_KEY: 'secret123',
      DATABASE_URL: 'postgres://localhost:5432/test',
    });
    expect(mockReadFileSync).toHaveBeenCalledWith(
      '/resolved/path/.env',
      'utf-8',
    );
  });

  it('should handle missing .env file gracefully', async () => {
    // Arrange
    const error = new Error(
      'ENOENT: no such file or directory',
    ) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockReadFileSync.mockImplementation(() => {
      throw error;
    });
    mockIsAbsolute.mockReturnValue(false);
    mockResolve.mockReturnValue('/resolved/path/.env');

    const provider = new DotEnvProvider({ path: '.env' });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({});
    expect(mockReadFileSync).toHaveBeenCalledWith(
      '/resolved/path/.env',
      'utf-8',
    );
  });

  it('should resolve relative paths correctly', async () => {
    // Arrange
    const envContent = 'KEY=value';
    mockReadFileSync.mockReturnValue(envContent);
    mockIsAbsolute.mockReturnValue(false);
    mockResolve.mockReturnValue('/current/working/dir/.env.local');

    const provider = new DotEnvProvider({ path: '.env.local' });

    // Act
    await provider.resolveSecrets();

    // Assert
    expect(mockIsAbsolute).toHaveBeenCalledWith('.env.local');
    expect(mockResolve).toHaveBeenCalledWith(process.cwd(), '.env.local');
    expect(mockReadFileSync).toHaveBeenCalledWith(
      '/current/working/dir/.env.local',
      'utf-8',
    );
  });

  it('should handle absolute paths correctly', async () => {
    // Arrange
    const envContent = 'KEY=value';
    const absolutePath = '/absolute/path/.env';
    mockReadFileSync.mockReturnValue(envContent);
    mockIsAbsolute.mockReturnValue(true);

    const provider = new DotEnvProvider({ path: absolutePath });

    // Act
    await provider.resolveSecrets();

    // Assert
    expect(mockIsAbsolute).toHaveBeenCalledWith(absolutePath);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockReadFileSync).toHaveBeenCalledWith(absolutePath, 'utf-8');
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

    mockReadFileSync.mockReturnValue(envContent);
    mockIsAbsolute.mockReturnValue(false);
    mockResolve.mockReturnValue('/test/.env');

    const provider = new DotEnvProvider({ path: '.env' });

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

    mockReadFileSync.mockReturnValue(envContent);
    mockIsAbsolute.mockReturnValue(false);
    mockResolve.mockReturnValue('/test/.env');

    const provider = new DotEnvProvider({ path: '.env' });

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

    mockReadFileSync.mockReturnValue(envContent);
    mockIsAbsolute.mockReturnValue(false);
    mockResolve.mockReturnValue('/test/.env');

    const provider = new DotEnvProvider({ path: '.env' });

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
    mockReadFileSync.mockReturnValue(envContent);
    mockIsAbsolute.mockReturnValue(false);
    mockResolve.mockReturnValue('/resolved/path/.env');

    const provider = new DotEnvProvider({ path: '.env', encoding: 'latin1' });

    // Act
    await provider.resolveSecrets();

    // Assert
    expect(mockReadFileSync).toHaveBeenCalledWith(
      '/resolved/path/.env',
      'latin1',
    );
  });
});

describe('ProcessEnvProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Set up test environment variables
    process.env = {
      MCP_API_KEY: 'secret123',
      MCP_DATABASE_URL: 'postgres://localhost:5432',
      MCP_DEBUG: 'true',
      NODE_ENV: 'test',
      PATH: '/usr/bin:/bin',
      OTHER_VAR: 'other_value',
      ALLOWED_VAR: 'allowed_value',
      BLOCKED_VAR: 'blocked_value',
    };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should filter environment variables by prefix', async () => {
    const provider = new ProcessEnvProvider({
      type: 'process',
      config: { prefix: 'MCP_' },
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      API_KEY: 'secret123',
      DATABASE_URL: 'postgres://localhost:5432',
      DEBUG: 'true',
    });
  });

  it('should filter environment variables by allowlist', async () => {
    const provider = new ProcessEnvProvider({
      type: 'process',
      config: { allowlist: ['NODE_ENV', 'ALLOWED_VAR'] },
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      NODE_ENV: 'test',
      ALLOWED_VAR: 'allowed_value',
    });
  });

  it('should filter environment variables by blocklist', async () => {
    const provider = new ProcessEnvProvider({
      type: 'process',
      config: { blocklist: ['PATH', 'NODE_ENV'] },
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      MCP_API_KEY: 'secret123',
      MCP_DATABASE_URL: 'postgres://localhost:5432',
      MCP_DEBUG: 'true',
      OTHER_VAR: 'other_value',
      ALLOWED_VAR: 'allowed_value',
      BLOCKED_VAR: 'blocked_value',
    });
  });

  it('should combine prefix and allowlist filtering (allowlist takes precedence)', async () => {
    const provider = new ProcessEnvProvider({
      type: 'process',
      config: {
        prefix: 'MCP_',
        allowlist: ['NODE_ENV', 'MCP_API_KEY'],
      },
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      NODE_ENV: 'test',
      API_KEY: 'secret123', // MCP_ prefix stripped from allowlisted items
    });
  });

  it('should apply blocklist after allowlist filtering', async () => {
    const provider = new ProcessEnvProvider({
      type: 'process',
      config: {
        allowlist: ['NODE_ENV', 'ALLOWED_VAR', 'BLOCKED_VAR'],
        blocklist: ['BLOCKED_VAR'],
      },
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      NODE_ENV: 'test',
      ALLOWED_VAR: 'allowed_value',
      // BLOCKED_VAR should be excluded by blocklist
    });
  });

  it('should pass all environment variables when no filters are configured', async () => {
    const provider = new ProcessEnvProvider({ type: 'process', config: {} });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      MCP_API_KEY: 'secret123',
      MCP_DATABASE_URL: 'postgres://localhost:5432',
      MCP_DEBUG: 'true',
      NODE_ENV: 'test',
      PATH: '/usr/bin:/bin',
      OTHER_VAR: 'other_value',
      ALLOWED_VAR: 'allowed_value',
      BLOCKED_VAR: 'blocked_value',
    });
  });

  it('should handle empty environment gracefully', async () => {
    // Arrange
    process.env = {};
    const provider = new ProcessEnvProvider({ type: 'process', config: {} });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({});
  });

  it('should handle undefined environment variables', async () => {
    // Arrange
    process.env = {
      DEFINED_VAR: 'value',
      EMPTY_VAR: '',
      // UNDEFINED_VAR is not set
    };
    const provider = new ProcessEnvProvider({ type: 'process', config: {} });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      DEFINED_VAR: 'value',
      EMPTY_VAR: '',
      // UNDEFINED_VAR should not be included
    });
  });
});

describe('InlineProvider', () => {
  // No setup needed for InlineProvider tests

  it('should pass through simple key-value pairs', async () => {
    const provider = new InlineProvider({
      type: 'inline',
      config: {
        values: {
          API_KEY: 'secret123',
          DATABASE_URL: 'postgres://localhost:5432',
        },
      },
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      API_KEY: 'secret123',
      DATABASE_URL: 'postgres://localhost:5432',
    });
  });

  it('should handle empty values object', async () => {
    const provider = new InlineProvider({
      type: 'inline',
      config: { values: {} },
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({});
  });

  it('should handle values with special characters', async () => {
    const provider = new InlineProvider({
      type: 'inline',
      config: {
        values: {
          COMPLEX_VALUE: 'value with spaces and = signs',
          JSON_CONFIG: '{"key": "value", "number": 123}',
          URL_WITH_PARAMS: 'https://api.example.com?key=value&other=param',
          MULTILINE: 'line1\nline2\nline3',
        },
      },
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      COMPLEX_VALUE: 'value with spaces and = signs',
      JSON_CONFIG: '{"key": "value", "number": 123}',
      URL_WITH_PARAMS: 'https://api.example.com?key=value&other=param',
      MULTILINE: 'line1\nline2\nline3',
    });
  });

  it('should handle empty string values', async () => {
    const provider = new InlineProvider({
      type: 'inline',
      config: {
        values: {
          EMPTY_VALUE: '',
          NORMAL_VALUE: 'normal',
        },
      },
    });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      EMPTY_VALUE: '',
      NORMAL_VALUE: 'normal',
    });
  });

  it('should return provider name correctly', () => {
    const provider = new InlineProvider({
      type: 'inline',
      config: { values: {} },
    });

    // Act
    const name = provider.getName();

    // Assert
    expect(name).toBe('inline');
  });
});

describe('Provider Interface Compliance', () => {
  it('should implement ISecretProvider interface correctly', async () => {
    // This test verifies that all providers implement the required interface
    // For DotEnvProvider, mock a successful file read
    const fsMock = await import('fs');
    const pathMock = await import('path');
    const mockReadFileSync = vi.mocked(fsMock.readFileSync);
    const mockResolve = vi.mocked(pathMock.resolve);
    const mockIsAbsolute = vi.mocked(pathMock.isAbsolute);

    mockReadFileSync.mockReturnValue('TEST_KEY=test_value');
    mockIsAbsolute.mockReturnValue(false);
    mockResolve.mockReturnValue('/test/.env.test');

    const providers: ISecretProvider[] = [
      new DotEnvProvider({ path: '.env.test' }),
      new ProcessEnvProvider({ type: 'process', config: {} }),
      new InlineProvider({ type: 'inline', config: { values: {} } }),
    ];

    for (const provider of providers) {
      // Verify interface compliance
      expect(typeof provider.resolveSecrets).toBe('function');
      expect(typeof provider.getName).toBe('function');

      // Verify return types
      expect(typeof provider.getName()).toBe('string');
      expect(provider.getName().length).toBeGreaterThan(0);

      // resolveSecrets should return a Promise
      const result = provider.resolveSecrets();
      expect(result).toBeInstanceOf(Promise);

      // Should be able to await the result
      const secrets = await result;
      expect(typeof secrets).toBe('object');
      expect(secrets).not.toBeNull();
    }
  });

  it('should handle errors appropriately', async () => {
    // Test error handling for various failure scenarios
    const fsMock = await import('fs');
    const pathMock = await import('path');
    const mockReadFileSync = vi.mocked(fsMock.readFileSync);
    const mockIsAbsolute = vi.mocked(pathMock.isAbsolute);

    // DotEnvProvider - file read error (should return empty object for ENOENT)
    const error = new Error(
      'ENOENT: no such file or directory',
    ) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockReadFileSync.mockImplementation(() => {
      throw error;
    });
    mockIsAbsolute.mockReturnValue(true);

    const dotenvProvider = new DotEnvProvider({
      path: '/nonexistent/path/.env',
    });
    const dotenvSecrets = await dotenvProvider.resolveSecrets();
    expect(dotenvSecrets).toEqual({});

    // ProcessEnvProvider - should handle empty environment gracefully
    const originalEnv = { ...process.env };
    process.env = {};
    try {
      const processProvider = new ProcessEnvProvider({
        type: 'process',
        config: {},
      });
      const processSecrets = await processProvider.resolveSecrets();
      expect(processSecrets).toEqual({});
    } finally {
      process.env = originalEnv;
    }

    // InlineProvider - should handle empty config gracefully
    const inlineProvider = new InlineProvider({
      type: 'inline',
      config: { values: {} },
    });
    const inlineSecrets = await inlineProvider.resolveSecrets();
    expect(inlineSecrets).toEqual({});
  });

  it('should provide consistent naming conventions', () => {
    // Verify that provider names follow consistent conventions
    const providers = [
      new DotEnvProvider({ path: '.env' }),
      new ProcessEnvProvider({ type: 'process', config: {} }),
      new InlineProvider({ type: 'inline', config: { values: {} } }),
    ];

    const expectedNames = ['dotenv', 'process', 'inline'];

    providers.forEach((provider, index) => {
      const name = provider.getName();
      expect(name).toBe(expectedNames[index]);
      expect(typeof name).toBe('string');
      expect(name.toLowerCase()).toBe(name);
      expect(name).not.toContain(' ');
    });
  });
});
