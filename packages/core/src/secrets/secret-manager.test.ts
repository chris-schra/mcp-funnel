/* eslint-disable max-lines */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ISecretProvider, ISecretProviderRegistry } from './types.js';
import { SecretManager } from './secret-manager.js';
import { SecretProviderRegistry } from './secret-provider-registry.js';
import { InlineProvider } from './inline-provider.js';
import { ProcessEnvProvider } from './process-env-provider.js';
import { DotEnvProvider } from './providers/dotenv/index.js';
import { BaseSecretProvider } from './base-provider.js';

class ThrowingProvider extends BaseSecretProvider {
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

class DelayedProvider extends BaseSecretProvider {
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
 * @param values - Key-value pairs for the provider
 * @returns Configured InlineProvider instance
 */
function createInlineProvider(values: Record<string, string>): InlineProvider {
  return new InlineProvider({
    type: 'inline',
    config: { values },
  });
}

/**
 * Writes an .env file for testing purposes.
 * @param baseDir - Base directory for the file
 * @param filename - Name of the .env file
 * @param content - Array of content lines to write
 * @returns Path to the created file
 */
function writeEnvFile(
  baseDir: string,
  filename: string,
  content: string[],
): string {
  const filePath = join(baseDir, filename);
  writeFileSync(filePath, content.join('\n'), 'utf-8');
  return filePath;
}

describe('SecretManager', () => {
  let registry: SecretProviderRegistry;
  let originalEnv: NodeJS.ProcessEnv;
  let workDir: string;

  beforeEach(() => {
    registry = new SecretProviderRegistry();
    originalEnv = { ...process.env };
    workDir = mkdtempSync(join(tmpdir(), 'secret-manager-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('SecretManager initialization tests', () => {
    it('should create manager with no providers', () => {
      const manager = new SecretManager();

      expect(manager.getProviderNames()).toEqual([]);
    });

    it('should create manager with single provider', () => {
      const inlineProvider = createInlineProvider({ API_KEY: 'dev-key' });
      const manager = new SecretManager([inlineProvider]);

      expect(manager.getProviderNames()).toEqual(['inline']);
    });

    it('should create manager with multiple providers', () => {
      process.env = {
        ...originalEnv,
        APP_API_KEY: 'env-api-key',
      };
      const inlineProvider = createInlineProvider({ DATABASE_URL: 'db-url' });
      const envProvider = new ProcessEnvProvider({
        type: 'process',
        config: { prefix: 'APP_' },
      });
      const manager = new SecretManager([inlineProvider, envProvider]);

      expect(manager.getProviderNames()).toEqual(['inline', 'process']);
    });

    it('should create manager with registry', () => {
      const manager = new SecretManager([], registry);

      expect(manager.getProviderNames()).toEqual([]);
    });

    it('should create manager with both providers and registry', () => {
      const inlineProvider = createInlineProvider({ API_KEY: 'value' });
      const envProvider = createInlineProvider({ API_KEY: 'other' });
      registry.register('inline-alt', envProvider);

      const manager = new SecretManager([inlineProvider], registry);

      expect(manager.getProviderNames()).toEqual(['inline', 'inline']);
    });
  });

  describe('Provider registration tests', () => {
    it('should allow adding providers after initialization', () => {
      const manager = new SecretManager();
      const inlineProvider = createInlineProvider({ API_KEY: 'value' });

      manager.addProvider(inlineProvider);
      expect(manager.getProviderNames()).toEqual(['inline']);

      manager.addProvider(createInlineProvider({ API_KEY: 'override' }));
      expect(manager.getProviderNames()).toEqual(['inline', 'inline']);
    });

    it('should allow removing providers by name', () => {
      const first = createInlineProvider({ FIRST: 'first' });
      const second = createInlineProvider({ SECOND: 'second' });
      const manager = new SecretManager([first, second]);

      const removed = manager.removeProvider('inline');
      expect(removed).toBe(true);
      expect(manager.getProviderNames()).toEqual([]);
    });

    it('should return false when removing non-existent provider', () => {
      const manager = new SecretManager([
        createInlineProvider({ API_KEY: 'x' }),
      ]);

      const removed = manager.removeProvider('missing');
      expect(removed).toBe(false);
      expect(manager.getProviderNames()).toEqual(['inline']);
    });

    it('should handle duplicate provider names gracefully', () => {
      const first = createInlineProvider({ KEY: 'value-one' });
      const second = createInlineProvider({ KEY: 'value-two' });
      const manager = new SecretManager([first]);

      manager.addProvider(second);
      expect(manager.getProviderNames()).toEqual(['inline', 'inline']);

      const removed = manager.removeProvider('inline');
      expect(removed).toBe(true);
      expect(manager.getProviderNames()).toEqual([]);
    });
  });

  describe('Secret resolution tests', () => {
    it('should resolve secrets from single provider', async () => {
      const inlineProvider = createInlineProvider({ API_KEY: 'inline-key' });
      const manager = new SecretManager([inlineProvider]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({ API_KEY: 'inline-key' });
    });

    it('should merge secrets from multiple providers', async () => {
      const baseProvider = createInlineProvider({
        API_KEY: 'base-key',
        DATABASE_URL: 'db-url',
      });
      const overridingProvider = createInlineProvider({
        API_KEY: 'override-key',
        SECRET_TOKEN: 'token',
      });
      const manager = new SecretManager([baseProvider, overridingProvider]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({
        API_KEY: 'override-key',
        DATABASE_URL: 'db-url',
        SECRET_TOKEN: 'token',
      });
    });

    it('should handle provider precedence (later overrides earlier)', async () => {
      const first = createInlineProvider({
        SHARED_KEY: 'first',
        ONLY_FIRST: 'one',
      });
      const second = createInlineProvider({
        SHARED_KEY: 'second',
        ONLY_SECOND: 'two',
      });
      const manager = new SecretManager([first, second]);

      const result = await manager.resolveSecrets();

      expect(result.SHARED_KEY).toBe('second');
      expect(result.ONLY_FIRST).toBe('one');
      expect(result.ONLY_SECOND).toBe('two');
    });

    it('should handle provider errors gracefully', async () => {
      const healthy = createInlineProvider({ HEALTHY_KEY: 'value' });
      const failing = new ThrowingProvider(
        'failing',
        new Error('intentional failure'),
      );
      const manager = new SecretManager([healthy, failing]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({ HEALTHY_KEY: 'value' });
    });

    it('should handle all providers failing gracefully', async () => {
      const failing = new ThrowingProvider(
        'failing',
        new Error('intentional failure'),
      );
      const manager = new SecretManager([failing]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({});
    });

    it('should support async resolution with real async behavior', async () => {
      const delayed = new DelayedProvider(
        'delayed-inline',
        { SLOW_KEY: 'value' },
        15,
      );
      const manager = new SecretManager([delayed]);

      const startTime = Date.now();
      const result = await manager.resolveSecrets();
      const elapsed = Date.now() - startTime;

      expect(result.SLOW_KEY).toBe('value');
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Caching tests', () => {
    it('should provide cache clearing functionality', async () => {
      const provider = createInlineProvider({ KEY: 'value' });
      const resolveSpy = vi.spyOn(provider, 'resolveSecrets');
      const manager = new SecretManager([provider], undefined, {
        cacheTtl: 500,
      });

      const firstResolution = await manager.resolveSecrets();
      const cacheInfoBeforeClear = manager.getCacheInfo();

      expect(firstResolution).toEqual({ KEY: 'value' });
      expect(resolveSpy).toHaveBeenCalledTimes(1);
      expect(cacheInfoBeforeClear).not.toBeNull();
      expect(cacheInfoBeforeClear?.valid).toBe(true);
      expect(cacheInfoBeforeClear?.ttl).toBe(500);

      manager.clearCache();
      // Clearing should collapse the cache seam so alternate transports can rehydrate consistently.
      expect(manager.getCacheInfo()).toBeNull();

      const secondResolution = await manager.resolveSecrets();

      expect(secondResolution).toEqual({ KEY: 'value' });
      expect(resolveSpy).toHaveBeenCalledTimes(2);
    });

    it('should support cached resolution lifecycle', async () => {
      const provider = createInlineProvider({ KEY: 'value' });
      const manager = new SecretManager([provider], undefined, {
        cacheTtl: 1000,
      });

      const first = await manager.resolveSecrets();
      const infoAfterFirst = manager.getCacheInfo();
      const second = await manager.resolveSecrets();

      manager.clearCache();
      const third = await manager.resolveSecrets();

      expect(first.KEY).toBe('value');
      expect(second.KEY).toBe('value');
      expect(third.KEY).toBe('value');
      expect(infoAfterFirst?.valid).toBe(true);
    });

    it('should handle cache invalidation correctly', async () => {
      const manager = new SecretManager([
        createInlineProvider({ KEY: 'value' }),
      ]);

      await manager.resolveSecrets();
      manager.clearCache();

      const result = await manager.resolveSecrets();
      expect(result).toEqual({ KEY: 'value' });
    });
  });

  describe('Registry integration tests', () => {
    it('should register providers in registry', () => {
      const inlineProvider = createInlineProvider({ KEY: 'value' });
      const dotEnvPath = writeEnvFile(workDir, '.env.basic', [
        'DOT_KEY=dot-value',
      ]);
      const dotEnvProvider = new DotEnvProvider({ path: dotEnvPath });

      registry.register('inline', inlineProvider);
      registry.register('dotenv', dotEnvProvider);

      expect(registry.get('inline')).toBe(inlineProvider);
      expect(registry.get('dotenv')).toBe(dotEnvProvider);
      expect(registry.getAll().size).toBe(2);
    });

    it('should retrieve providers from registry', () => {
      const inlineProvider = createInlineProvider({ KEY: 'value' });
      registry.register('inline', inlineProvider);

      const retrieved = registry.get('inline');
      expect(retrieved).toBe(inlineProvider);
      expect(retrieved?.getName()).toBe('inline');
    });

    it('should handle registry provider not found', () => {
      const retrieved = registry.get('missing');
      expect(retrieved).toBeUndefined();
    });

    it('should prevent duplicate provider registration', () => {
      registry.register('inline', createInlineProvider({ KEY: 'value' }));

      expect(() => {
        registry.register('inline', createInlineProvider({ KEY: 'other' }));
      }).toThrow("Secret provider 'inline' is already registered");
    });

    it('should return all registered providers', () => {
      registry.register('inline', createInlineProvider({ KEY: 'value' }));
      registry.register('second', createInlineProvider({ KEY: 'other' }));

      const allProviders = registry.getAll();
      expect(allProviders.size).toBe(2);
      expect(allProviders.has('inline')).toBe(true);
      expect(allProviders.has('second')).toBe(true);
    });

    it('should integrate registry with SecretManager', async () => {
      const inlineProvider = createInlineProvider({ API_KEY: 'inline-key' });
      const envPath = writeEnvFile(workDir, '.env.inline', [
        'API_KEY=dotenv-key',
        'NEW_SECRET=dotenv-secret',
      ]);
      const dotEnvProvider = new DotEnvProvider({ path: envPath });

      registry.register('inline', inlineProvider);
      registry.register('dotenv', dotEnvProvider);

      const manager = new SecretManager([], registry);
      const secrets = await manager.resolveSecrets();

      expect(secrets).toEqual({
        API_KEY: 'dotenv-key',
        NEW_SECRET: 'dotenv-secret',
      });
    });

    it('should avoid duplicate providers when registry references existing instances', async () => {
      const inlineProvider = createInlineProvider({ TOKEN: 'value' });
      registry.register('inline', inlineProvider);

      const manager = new SecretManager([inlineProvider], registry);
      const names = manager.getProviderNames();

      expect(names).toEqual(['inline']);

      const secrets = await manager.resolveSecrets();
      expect(secrets).toEqual({ TOKEN: 'value' });
    });

    it('should handle registry provider lifecycle', () => {
      const inlineProvider = createInlineProvider({ KEY: 'value' });
      registry.register('inline', inlineProvider);
      const manager = new SecretManager([], registry);

      const providerFromRegistry = registry.get('inline');
      if (providerFromRegistry) {
        manager.addProvider(providerFromRegistry);
      }

      expect(manager.getProviderNames()).toContain('inline');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty provider list', async () => {
      const manager = new SecretManager([]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({});
    });

    it('should handle providers returning empty secrets', async () => {
      const emptyProvider = createInlineProvider({});
      const nonEmptyProvider = createInlineProvider({ API_KEY: 'value' });
      const manager = new SecretManager([emptyProvider, nonEmptyProvider]);

      const result = await manager.resolveSecrets();

      expect(result).toEqual({ API_KEY: 'value' });
    });

    it('should handle concurrent resolution calls', async () => {
      const manager = new SecretManager([
        createInlineProvider({ API_KEY: 'value' }),
      ]);

      const [first, second, third] = await Promise.all([
        manager.resolveSecrets(),
        manager.resolveSecrets(),
        manager.resolveSecrets(),
      ]);

      expect(first.API_KEY).toBe('value');
      expect(second.API_KEY).toBe('value');
      expect(third.API_KEY).toBe('value');
    });

    it('should validate provider interface compliance', () => {
      const provider: ISecretProvider = createInlineProvider({ KEY: 'value' });

      expect(provider.resolveSecrets()).toBeInstanceOf(Promise);
      expect(typeof provider.getName()).toBe('string');
    });

    it('should handle mixed sync/async provider behavior', async () => {
      const synchronousProvider = createInlineProvider({ SYNC_KEY: 'value' });
      const result = synchronousProvider.resolveSecrets();

      expect(result).toBeInstanceOf(Promise);
      expect(await result).toEqual({ SYNC_KEY: 'value' });
    });
  });

  describe('Type safety and interface compliance', () => {
    it('should ensure resolved secrets structure', async () => {
      const manager = new SecretManager([
        createInlineProvider({ API_KEY: 'value' }),
      ]);

      const result = await manager.resolveSecrets();

      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
      Object.values(result).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });

    it('should ensure provider interface compliance', () => {
      const provider: ISecretProvider = createInlineProvider({ KEY: 'value' });

      expect(provider.getName()).toBe('inline');
      expect(provider.resolveSecrets()).toBeInstanceOf(Promise);
    });

    it('should ensure registry interface compliance', () => {
      const reg: ISecretProviderRegistry = registry;
      const provider = createInlineProvider({ KEY: 'value' });

      expect(() => reg.register('test', provider)).not.toThrow();
      expect(reg.get('test')).toBe(provider);
      expect(reg.getAll()).toBeInstanceOf(Map);
    });
  });
});
