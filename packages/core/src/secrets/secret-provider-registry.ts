/**
 * Registry for managing secret providers in MCP Funnel.
 *
 * Provides centralized registration and retrieval of secret providers,
 * following the registry pattern used throughout the codebase.
 * @public
 */

import { ISecretProvider, ISecretProviderRegistry } from './types.js';

/**
 * Implementation of the secret provider registry.
 *
 * Manages a collection of secret providers with unique names,
 * ensuring no duplicate registrations and providing type-safe
 * access to registered providers.
 * @public
 */
export class SecretProviderRegistry implements ISecretProviderRegistry {
  private providers = new Map<string, ISecretProvider>();

  /**
   * Registers a secret provider with the given name.
   * @param name - Unique identifier for the provider
   * @param provider - The secret provider implementation to register
   * @throws \{Error\} When a provider with the same name is already registered
   */
  public register(name: string, provider: ISecretProvider): void {
    if (this.providers.has(name)) {
      throw new Error(`Secret provider '${name}' is already registered`);
    }

    this.providers.set(name, provider);
  }

  /**
   * Retrieves a registered secret provider by name.
   * @param name - The name of the provider to retrieve
   * @returns The provider if found, undefined otherwise
   */
  public get(name: string): ISecretProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Returns all registered providers as a Map.
   * @returns A new Map containing all registered providers with their names as keys
   */
  public getAll(): Map<string, ISecretProvider> {
    return new Map(this.providers);
  }
}
