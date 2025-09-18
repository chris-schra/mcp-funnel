import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ISecretProvider, ISecretProviderRegistry } from './types.js';
import { SecretManager } from './secret-manager.js';
import { SecretProviderRegistry } from './secret-provider-registry.js';

// Mock provider implementations for testing
class MockSecretProvider implements ISecretProvider {
  constructor(
    private name: string,
    private secrets: Record<string, string> = {},
    private shouldThrow = false,
  ) {}

  async resolveSecrets(): Promise<Record<string, string>> {
    if (this.shouldThrow) {
      throw new Error(`Provider ${this.name} failed to resolve secrets`);
    }
    return { ...this.secrets };
  }

  getName(): string {
    return this.name;
  }
}

// Use the real registry for testing

// Now using the real implementations

describe('SecretManager', () => {
  let registry: SecretProviderRegistry;
  let envProvider: MockSecretProvider;
  let fileProvider: MockSecretProvider;
  let failingProvider: MockSecretProvider;

  beforeEach(() => {
    registry = new SecretProviderRegistry();
    envProvider = new MockSecretProvider('environment', {
      API_KEY: 'env-api-key',
      DATABASE_URL: 'env-db-url',
    });
    fileProvider = new MockSecretProvider('file', {
      API_KEY: 'file-api-key', // Will override env provider
      SECRET_TOKEN: 'file-token',
    });
    failingProvider = new MockSecretProvider(
      'failing',
      { FAIL_KEY: 'never-seen' },
      true,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('SecretManager initialization tests', () => {
    it('should create manager with no providers', () => {
      const manager = new SecretManager();

      expect(manager.getProviderNames()).toEqual([]);
    });

    it('should create manager with single provider', () => {
      const manager = new SecretManager([envProvider]);

      expect(manager.getProviderNames()).toHaveLength(1);
      expect(manager.getProviderNames()[0]).toBe('environment');
    });

    it('should create manager with multiple providers', () => {
      const manager = new SecretManager([envProvider, fileProvider]);

      expect(manager.getProviderNames()).toHaveLength(2);
      expect(manager.getProviderNames()).toContain('environment');
      expect(manager.getProviderNames()).toContain('file');
    });

    it('should create manager with registry', () => {
      const manager = new SecretManager([], registry);

      expect(manager.getProviderNames()).toEqual([]);
    });

    it('should create manager with both providers and registry', () => {
      const manager = new SecretManager([envProvider], registry);

      expect(manager.getProviderNames()).toHaveLength(1);
    });
  });

  describe('Provider registration tests', () => {
    it('should allow adding providers after initialization', () => {
      const manager = new SecretManager();

      manager.addProvider(envProvider);
      expect(manager.getProviderNames()).toHaveLength(1);

      manager.addProvider(fileProvider);
      expect(manager.getProviderNames()).toHaveLength(2);
    });

    it('should allow removing providers by name', () => {
      const manager = new SecretManager([envProvider, fileProvider]);

      const removed = manager.removeProvider('environment');
      expect(removed).toBe(true);
      expect(manager.getProviderNames()).toHaveLength(1);
      expect(manager.getProviderNames()[0]).toBe('file');
    });

    it('should return false when removing non-existent provider', () => {
      const manager = new SecretManager([envProvider]);

      const removed = manager.removeProvider('nonexistent');
      expect(removed).toBe(false);
      expect(manager.getProviderNames()).toHaveLength(1);
    });

    it('should handle duplicate provider names gracefully', () => {
      const manager = new SecretManager([envProvider]);
      const duplicateProvider = new MockSecretProvider('environment', {
        DUPLICATE_KEY: 'value',
      });

      // Should allow adding duplicate names (manager doesn't enforce uniqueness)
      manager.addProvider(duplicateProvider);
      expect(manager.getProviderNames()).toHaveLength(2);

      // Removing by name should remove first matching provider
      const removed = manager.removeProvider('environment');
      expect(removed).toBe(true);
      expect(manager.getProviderNames()).toHaveLength(1);
    });
  });

  describe('Secret resolution tests', () => {
    it('should resolve secrets from single provider', async () => {
      const manager = new SecretManager([envProvider]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({
        API_KEY: 'env-api-key',
        DATABASE_URL: 'env-db-url',
      });
    });

    it('should merge secrets from multiple providers', async () => {
      const manager = new SecretManager([envProvider, fileProvider]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({
        API_KEY: 'file-api-key', // file provider overrides env
        DATABASE_URL: 'env-db-url', // only in env provider
        SECRET_TOKEN: 'file-token', // only in file provider
      });
    });

    it('should handle provider precedence (later overrides earlier)', async () => {
      const firstProvider = new MockSecretProvider('first', {
        SHARED_KEY: 'first-value',
        FIRST_ONLY: 'first-only',
      });
      const secondProvider = new MockSecretProvider('second', {
        SHARED_KEY: 'second-value', // Should override first
        SECOND_ONLY: 'second-only',
      });
      const manager = new SecretManager([firstProvider, secondProvider]);

      const result = await manager.resolveSecrets();

      expect(result.SHARED_KEY).toBe('second-value');
      expect(result.FIRST_ONLY).toBe('first-only');
      expect(result.SECOND_ONLY).toBe('second-only');
    });

    it('should handle provider errors gracefully', async () => {
      const manager = new SecretManager([envProvider, failingProvider]);

      const result = await manager.resolveSecrets();

      // Should still get secrets from working provider
      expect(result).toEqual({
        API_KEY: 'env-api-key',
        DATABASE_URL: 'env-db-url',
      });
      // Should not contain secrets from failing provider
      expect(result.FAIL_KEY).toBeUndefined();
    });

    it('should handle all providers failing gracefully', async () => {
      const manager = new SecretManager([failingProvider]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({});
    });

    it('should support async resolution', async () => {
      const slowProvider = new MockSecretProvider('slow', {
        SLOW_KEY: 'value',
      });
      // Mock async behavior
      const originalResolve = slowProvider.resolveSecrets;
      slowProvider.resolveSecrets = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return originalResolve.call(slowProvider);
      });

      const manager = new SecretManager([slowProvider]);

      const startTime = Date.now();
      const result = await manager.resolveSecrets();
      const endTime = Date.now();

      expect(result.SLOW_KEY).toBe('value');
      expect(endTime - startTime).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Caching tests', () => {
    it('should provide cache clearing functionality', () => {
      const manager = new SecretManager([envProvider]);

      // Cache clearing should not throw
      expect(() => manager.clearCache()).not.toThrow();
    });

    it('should support cached resolution (implementation specific)', async () => {
      const manager = new SecretManager([envProvider]);

      // First resolution
      const result1 = await manager.resolveSecrets();
      expect(result1.API_KEY).toBe('env-api-key');

      // Second resolution (should use cache if implemented)
      const result2 = await manager.resolveSecrets();
      expect(result2.API_KEY).toBe('env-api-key');

      // Cache clear
      manager.clearCache();

      // Third resolution (should re-fetch)
      const result3 = await manager.resolveSecrets();
      expect(result3.API_KEY).toBe('env-api-key');
    });

    it('should handle cache invalidation correctly', async () => {
      const manager = new SecretManager([envProvider]);

      await manager.resolveSecrets();
      manager.clearCache();

      // Should not throw after cache clear
      const result = await manager.resolveSecrets();
      expect(result).toBeDefined();
    });
  });

  describe('Registry integration tests', () => {
    it('should register providers in registry', () => {
      registry.register('env', envProvider);
      registry.register('file', fileProvider);

      expect(registry.get('env')).toBe(envProvider);
      expect(registry.get('file')).toBe(fileProvider);
      expect(registry.getAll().size).toBe(2);
    });

    it('should retrieve providers from registry', () => {
      registry.register('env', envProvider);

      const retrieved = registry.get('env');
      expect(retrieved).toBe(envProvider);
      expect(retrieved?.getName()).toBe('environment');
    });

    it('should handle registry provider not found', () => {
      const retrieved = registry.get('nonexistent');
      expect(retrieved).toBeUndefined();
    });

    it('should prevent duplicate provider registration', () => {
      registry.register('env', envProvider);

      expect(() => registry.register('env', fileProvider)).toThrow(
        "Secret provider 'env' is already registered",
      );
    });

    it('should return all registered providers', () => {
      registry.register('env', envProvider);
      registry.register('file', fileProvider);

      const allProviders = registry.getAll();
      expect(allProviders.size).toBe(2);
      expect(allProviders.has('env')).toBe(true);
      expect(allProviders.has('file')).toBe(true);
    });

    it('should support registry lifecycle management', () => {
      // Registry should start empty
      expect(registry.getAll().size).toBe(0);

      // Add providers
      registry.register('env', envProvider);
      registry.register('file', fileProvider);
      expect(registry.getAll().size).toBe(2);
    });

    it('should integrate registry with SecretManager', async () => {
      registry.register('env', envProvider);
      registry.register('file', fileProvider);

      const manager = new SecretManager([], registry);

      // Manager should be able to use providers from registry
      const secrets = await manager.resolveSecrets();
      expect(secrets).toEqual({
        API_KEY: 'file-api-key', // file provider overrides env
        DATABASE_URL: 'env-db-url',
        SECRET_TOKEN: 'file-token',
      });
    });

    it('should handle registry provider lifecycle', () => {
      registry.register('env', envProvider);
      const manager = new SecretManager([], registry);

      // Add provider from registry to manager directly
      const providerFromRegistry = registry.get('env');
      if (providerFromRegistry) {
        manager.addProvider(providerFromRegistry);
      }

      expect(manager.getProviderNames()).toContain('environment');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty provider list', async () => {
      const manager = new SecretManager([]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({});
    });

    it('should handle providers returning empty secrets', async () => {
      const emptyProvider = new MockSecretProvider('empty', {});
      const manager = new SecretManager([emptyProvider, envProvider]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({
        API_KEY: 'env-api-key',
        DATABASE_URL: 'env-db-url',
      });
    });

    it('should handle concurrent resolution calls', async () => {
      const manager = new SecretManager([envProvider]);

      const promises = [
        manager.resolveSecrets(),
        manager.resolveSecrets(),
        manager.resolveSecrets(),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.API_KEY).toBe('env-api-key');
      });
    });

    it('should validate provider interface compliance', () => {
      // Provider must implement ISecretProvider interface
      expect(envProvider.resolveSecrets).toBeInstanceOf(Function);
      expect(envProvider.getName).toBeInstanceOf(Function);
      expect(typeof envProvider.getName()).toBe('string');
    });

    it('should handle mixed sync/async provider behavior', async () => {
      // All providers should return promises, even if internally synchronous
      const syncProvider = new MockSecretProvider('sync', {
        SYNC_KEY: 'value',
      });
      const result = syncProvider.resolveSecrets();

      expect(result).toBeInstanceOf(Promise);
      expect(await result).toEqual({ SYNC_KEY: 'value' });
    });
  });

  describe('Type safety and interface compliance', () => {
    it('should ensure resolved secrets structure', async () => {
      const manager = new SecretManager([envProvider]);

      const result = await manager.resolveSecrets();

      // Verify result is a plain object with string values
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
      Object.values(result).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });

    it('should ensure provider interface compliance', () => {
      const provider: ISecretProvider = envProvider;

      // TypeScript should enforce interface compliance
      expect(provider.getName()).toBe('environment');
      expect(provider.resolveSecrets()).toBeInstanceOf(Promise);
    });

    it('should ensure registry interface compliance', () => {
      const reg: ISecretProviderRegistry = registry;

      // TypeScript should enforce interface compliance
      expect(() => reg.register('test', envProvider)).not.toThrow();
      expect(reg.get('test')).toBeDefined();
      expect(reg.getAll()).toBeInstanceOf(Map);
    });
  });
});
