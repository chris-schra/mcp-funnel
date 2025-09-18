/**
 * Inline secret provider implementation.
 *
 * This provider provides secrets directly as key-value pairs specified in the configuration.
 * Following the SEAMS principle, this simple implementation serves as both a baseline
 * provider and a useful tool for testing and development scenarios.
 *
 * WARNING: This provider stores secrets in plain text within the configuration.
 * It should only be used in development environments or for non-sensitive values.
 */

import type { ISecretProvider } from './types.js';
import type { InlineProviderConfig } from './provider-configs.js';

/**
 * Secret provider that returns secrets directly from configuration values.
 *
 * This provider simply passes through the configured key-value pairs as secrets.
 * It's useful for testing, development, or providing default values that aren't
 * actually sensitive.
 *
 * @example
 * ```typescript
 * const provider = new InlineProvider({
 *   type: 'inline',
 *   config: {
 *     values: {
 *       API_KEY: 'dev-key-123',
 *       DATABASE_URL: 'postgres://localhost:5432/dev'
 *     }
 *   }
 * });
 *
 * const secrets = await provider.resolveSecrets();
 * // Returns: { API_KEY: 'dev-key-123', DATABASE_URL: 'postgres://localhost:5432/dev' }
 * ```
 */
export class InlineProvider implements ISecretProvider {
  private readonly config: InlineProviderConfig['config'];

  /**
   * Creates a new InlineProvider instance.
   *
   * @param config - Configuration containing the key-value pairs to provide as secrets
   */
  constructor(config: InlineProviderConfig) {
    this.config = config.config;
  }

  /**
   * Resolves secrets by returning the configured values directly.
   *
   * This method simply returns a copy of the configured values object.
   * No processing or transformation is performed on the values.
   *
   * @returns A promise resolving to the configured key-value pairs
   */
  async resolveSecrets(): Promise<Record<string, string>> {
    // Return a shallow copy to prevent external modification of the internal config
    return { ...this.config.values };
  }

  /**
   * Returns the provider name identifier.
   *
   * @returns The string 'inline' identifying this provider type
   */
  getName(): string {
    return 'inline';
  }
}
