import { writeFileSync } from 'fs';
import { join } from 'path';
import { InlineProvider } from '../inline-provider.js';
import { BaseSecretProvider } from '../base-provider.js';

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
 * Creates an inline secret provider for testing.
 *
 * @param values - Key-value pairs of secrets to provide
 * @returns Configured inline provider instance
 */
export function createInlineProvider(values: Record<string, string>): InlineProvider {
  return new InlineProvider({
    type: 'inline',
    config: { values },
  });
}

/**
 * Writes an environment file to disk for testing.
 *
 * @param baseDir - Directory to write the file to
 * @param filename - Name of the .env file
 * @param content - Array of lines to write to the file
 * @returns Absolute path to the created file
 */
export function writeEnvFile(baseDir: string, filename: string, content: string[]): string {
  const filePath = join(baseDir, filename);
  writeFileSync(filePath, content.join('\n'), 'utf-8');
  return filePath;
}
