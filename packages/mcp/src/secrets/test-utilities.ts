import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { InlineProvider } from './inline-provider.js';
import { ProcessEnvProvider } from './process-env-provider.js';
import { DotEnvProvider } from './providers/dotenv/index.js';
import { BaseSecretProvider } from './base-provider.js';

/**
 * Mock provider that always throws an error when resolving secrets
 */
export class ThrowingProvider extends BaseSecretProvider {
  constructor(
    name: string,
    private readonly error: Error,
  ) {
    super(name);
  }

  protected async doResolveSecrets(): Promise<Record<string, string>> {
    throw this.error;
  }
}

/**
 * Mock provider that introduces a delay before resolving secrets
 */
export class DelayedProvider extends BaseSecretProvider {
  constructor(
    name: string,
    private readonly values: Record<string, string>,
    private readonly delayMs: number,
  ) {
    super(name);
  }

  protected async doResolveSecrets(): Promise<Record<string, string>> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return { ...this.values };
  }
}

/**
 * Creates an InlineProvider with the given values
 */
export function createInlineProvider(
  values: Record<string, string>,
): InlineProvider {
  return new InlineProvider({
    type: 'inline',
    config: { values },
  });
}

/**
 * Creates a ProcessEnvProvider with the given prefix
 */
export function createProcessEnvProvider(prefix = 'APP_'): ProcessEnvProvider {
  return new ProcessEnvProvider({
    type: 'process',
    config: { prefix },
  });
}

/**
 * Writes an environment file to the given directory and returns the file path
 */
export function writeEnvFile(
  baseDir: string,
  filename: string,
  content: string[],
): string {
  const filePath = join(baseDir, filename);
  writeFileSync(filePath, content.join('\n'), 'utf-8');
  return filePath;
}

/**
 * Creates a DotEnvProvider for the given file path
 */
export function createDotEnvProvider(envPath: string): DotEnvProvider {
  return new DotEnvProvider({ path: envPath });
}

/**
 * Sets up a temporary working directory for tests
 */
export function setupWorkDir(): string {
  return mkdtempSync(join(tmpdir(), 'secret-manager-test-'));
}

/**
 * Common test data for provider tests
 */
export const testData = {
  simple: { API_KEY: 'test-key' },
  multiple: {
    API_KEY: 'test-key',
    DATABASE_URL: 'db-url',
    SECRET_TOKEN: 'token',
  },
  override: {
    base: { API_KEY: 'base-key', DATABASE_URL: 'db-url' },
    overriding: { API_KEY: 'override-key', SECRET_TOKEN: 'token' },
    expected: {
      API_KEY: 'override-key',
      DATABASE_URL: 'db-url',
      SECRET_TOKEN: 'token',
    },
  },
  precedence: {
    first: { SHARED_KEY: 'first', ONLY_FIRST: 'one' },
    second: { SHARED_KEY: 'second', ONLY_SECOND: 'two' },
    expected: { SHARED_KEY: 'second', ONLY_FIRST: 'one', ONLY_SECOND: 'two' },
  },
};
