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

import { BaseSecretProvider } from './base-provider.js';
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
export class InlineProvider extends BaseSecretProvider {
  private readonly config: InlineProviderConfig['config'];

  /**
   * Creates a new InlineProvider instance.
   *
   * @param config - Configuration containing the key-value pairs to provide as secrets
   */
  public constructor(config: InlineProviderConfig) {
    super('inline');
    this.config = config.config;
  }

  /**
   * Resolves secrets by returning the configured values directly.
   *
   * This method simply returns the configured values object.
   * No processing or transformation is performed on the values.
   * Defensive copying is handled by the base class.
   *
   * @returns A promise resolving to the configured key-value pairs
   */
  protected async doResolveSecrets(): Promise<Record<string, string>> {
    return this.config.values;
  }
}
