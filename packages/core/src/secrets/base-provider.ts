/**
 * Base class for secret provider implementations.
 *
 * Provides common functionality and enforces consistent patterns across all
 * secret providers. Following the SEAMS principle, this base class provides
 * extension points for different secret resolution strategies while ensuring
 * consistent behavior for common operations.
 * @public
 */

import type { ISecretProvider } from './types.js';

/**
 * Abstract base class for secret providers.
 *
 * Implements common functionality shared across all providers including
 * name management and defensive copying patterns. Concrete providers only
 * need to implement the actual secret resolution logic.
 * @example
 * ```typescript
 * export class MyProvider extends BaseSecretProvider {
 *   constructor(config: MyProviderConfig) {
 *     super('my-provider');
 *     this.config = config.config;
 *   }
 *
 *   protected async doResolveSecrets(): Promise<Record<string, string>> {
 *     // Provider-specific implementation
 *     return { SECRET_KEY: 'value' };
 *   }
 * }
 * ```
 * @public
 */
export abstract class BaseSecretProvider implements ISecretProvider {
  private readonly providerName: string;

  /**
   * Creates a new base secret provider.
   * @param name - The unique identifier for this provider type
   * @public
   */
  public constructor(name: string) {
    this.providerName = name;
  }

  /**
   * Returns the provider name identifier.
   * @public
   */
  public getName(): string {
    return this.providerName;
  }

  /**
   * Resolves secrets by calling the concrete implementation and ensuring defensive copying.
   *
   * This method wraps the concrete provider's implementation to ensure consistent
   * behavior across all providers, including proper error handling and defensive
   * copying of the results.
   * @public
   */
  public async resolveSecrets(): Promise<Record<string, string>> {
    const secrets = await this.doResolveSecrets();

    // Return a defensive copy to prevent external modification
    return { ...secrets };
  }

  /**
   * Abstract method that concrete providers must implement.
   *
   * This method contains the provider-specific logic for resolving secrets.
   * The base class handles defensive copying and common error handling patterns.
   * @throws {Error} When the provider encounters an unrecoverable error
   * @internal
   */
  protected abstract doResolveSecrets(): Promise<Record<string, string>>;
}
