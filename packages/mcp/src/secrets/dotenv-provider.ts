import { readFileSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import type { ISecretProvider } from './types.js';
import type { DotEnvProviderConfig } from './provider-configs.js';

/**
 * Secret provider that reads secrets from a .env file.
 *
 * Supports both relative and absolute paths, handles comments and empty lines,
 * and provides robust parsing of key-value pairs with proper quote handling.
 */
export class DotEnvProvider implements ISecretProvider {
  private readonly filePath: string;
  private readonly encoding: BufferEncoding;

  constructor(config: DotEnvProviderConfig['config'], configFileDir?: string) {
    this.encoding = (config.encoding as BufferEncoding) || 'utf-8';

    // Resolve path based on whether it's absolute or relative
    if (isAbsolute(config.path)) {
      this.filePath = config.path;
    } else {
      // For relative paths, resolve relative to config file location if provided,
      // otherwise relative to current working directory
      const baseDir = configFileDir || process.cwd();
      this.filePath = resolve(baseDir, config.path);
    }
  }

  async resolveSecrets(): Promise<Record<string, string>> {
    try {
      const content = readFileSync(this.filePath, this.encoding);
      return this.parseEnvContent(content);
    } catch (error) {
      // Handle file not found gracefully (return empty object, don't throw)
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return {};
      }
      // Re-throw other errors as they indicate more serious issues
      throw error;
    }
  }

  getName(): string {
    return 'dotenv';
  }

  /**
   * Parses .env file content into key-value pairs.
   *
   * Handles:
   * - Comments (lines starting with #)
   * - Empty lines
   * - Quoted values (both single and double quotes)
   * - Values with special characters
   * - Keys with equals signs in values (splits on first =)
   */
  private parseEnvContent(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Find the first equals sign to split key and value
      const equalsIndex = trimmedLine.indexOf('=');
      if (equalsIndex === -1) {
        // Skip lines without equals signs
        continue;
      }

      const key = trimmedLine.substring(0, equalsIndex).trim();
      let value = trimmedLine.substring(equalsIndex + 1);

      // Handle quoted values
      value = this.unquoteValue(value);

      result[key] = value;
    }

    return result;
  }

  /**
   * Removes surrounding quotes from values and handles special characters.
   *
   * Supports both single and double quotes.
   * For unquoted values, removes trailing comments starting with #.
   */
  private unquoteValue(value: string): string {
    value = value.trim();

    // Handle double-quoted values
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      return value.slice(1, -1);
    }

    // Handle single-quoted values
    if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      return value.slice(1, -1);
    }

    // For unquoted values, remove trailing comments
    // Find the first # that's not inside quotes
    let inQuotes = false;
    let quoteChar = '';
    for (let i = 0; i < value.length; i++) {
      const char = value[i];

      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      } else if (!inQuotes && char === '#') {
        // Found unquoted comment marker, truncate here
        return value.substring(0, i).trim();
      }
    }

    return value;
  }
}
