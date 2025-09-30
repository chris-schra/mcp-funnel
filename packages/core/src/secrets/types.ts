/**
 * Core interfaces for secret provider system in MCP Funnel.
 *
 * This module defines the foundational types for managing secrets across
 * different providers (environment variables, credential stores, etc.).
 * Following the SEAMS principle, these interfaces provide extension points
 * for future provider implementations without changing the core API.
 * @public
 */

/**
 * Core interface for all secret providers.
 *
 * Secret providers are responsible for resolving secrets from their specific
 * source (environment variables, credential stores, etc.) and returning them
 * as a flat key-value mapping.
 * @example
 * ```typescript
 * class EnvSecretProvider implements ISecretProvider {
 *   async resolveSecrets(): Promise<Record<string, string>> {
 *     return { API_KEY: process.env.API_KEY || '' };
 *   }
 *
 *   getName(): string {
 *     return 'environment';
 *   }
 * }
 * ```
 * @public
 */
export interface ISecretProvider {
  /**
   * Resolves all secrets managed by this provider.
   * @returns A promise that resolves to a key-value mapping of secret names to values.
   *          Empty string values indicate missing or unset secrets.
   * @throws \{Error\} When the provider encounters an unrecoverable error accessing secrets
   */
  resolveSecrets(): Promise<Record<string, string>>;

  /**
   * Returns the unique name/identifier for this provider.
   *
   * Used for registration, logging, and debugging purposes.
   * Should be a stable identifier that doesn't change between runs.
   * @returns The provider's unique name (e.g., 'environment', 'keychain', 'vault')
   */
  getName(): string;
}

/**
 * Result of a secret resolution operation, including metadata.
 *
 * Provides both the resolved secrets and optional metadata about the resolution
 * process for debugging and auditing purposes.
 * @public
 */
export interface SecretResolutionResult {
  /**
   * The resolved secrets as key-value pairs.
   * Keys are secret names, values are the resolved secret values.
   */
  secrets: Record<string, string>;

  /**
   * Optional metadata about the resolution process.
   * Useful for debugging, auditing, and provider-specific information.
   */
  metadata?: {
    /**
     * The source or provider that resolved these secrets.
     * Should match the provider's getName() result.
     */
    source: string;

    /**
     * Timestamp when the secrets were resolved.
     * Useful for cache invalidation and audit trails.
     */
    resolvedAt: Date;

    /**
     * Additional provider-specific metadata.
     * Extension point for future provider implementations.
     */
    [key: string]: unknown;
  };
}

/**
 * Registry interface for managing multiple secret providers.
 *
 * Provides a centralized way to register, retrieve, and manage secret providers.
 * Follows the registry pattern used elsewhere in the codebase for consistency.
 * @example
 * ```typescript
 * const registry = new SecretProviderRegistry();
 * registry.register('env', new EnvSecretProvider());
 *
 * const provider = registry.get('env');
 * const allProviders = registry.getAll();
 * ```
 * @public
 */
export interface ISecretProviderRegistry {
  /**
   * Registers a secret provider with the given name.
   * @param name - Unique identifier for the provider. Should match provider.getName()
   * @param provider - The secret provider implementation to register
   * @throws \{Error\} When a provider with the same name is already registered
   */
  register(name: string, provider: ISecretProvider): void;

  /**
   * Retrieves a registered secret provider by name.
   * @param name - The name of the provider to retrieve
   * @returns The provider if found, undefined otherwise
   */
  get(name: string): ISecretProvider | undefined;

  /**
   * Returns all registered providers as a Map.
   * @returns A Map containing all registered providers with their names as keys
   */
  getAll(): Map<string, ISecretProvider>;
}
