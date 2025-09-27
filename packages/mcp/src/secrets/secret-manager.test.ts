import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync } from 'fs';
import type { ISecretProvider, ISecretProviderRegistry } from './types.js';
import { SecretManager } from './secret-manager.js';
import { SecretProviderRegistry } from './secret-provider-registry.js';
import {
  ThrowingProvider,
  DelayedProvider,
  createInlineProvider,
  createProcessEnvProvider,
  createDotEnvProvider,
  writeEnvFile,
  setupWorkDir,
  testData,
} from './test-utilities.js';

describe('SecretManager', () => {
  let registry: SecretProviderRegistry;
  let originalEnv: NodeJS.ProcessEnv;
  let workDir: string;

  beforeEach(() => {
    registry = new SecretProviderRegistry();
    originalEnv = { ...process.env };
    workDir = setupWorkDir();
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('Initialization', () => {
    const initializationCases = [
      {
        name: 'no providers',
        providers: () => [],
        expected: [],
      },
      {
        name: 'single provider',
        providers: () => [createInlineProvider(testData.simple)],
        expected: ['inline'],
      },
      {
        name: 'multiple providers',
        providers: () => {
          process.env = { ...originalEnv, APP_API_KEY: 'env-api-key' };
          return [
            createInlineProvider({ DATABASE_URL: 'db-url' }),
            createProcessEnvProvider(),
          ];
        },
        expected: ['inline', 'process'],
      },
    ];

    initializationCases.forEach(({ name, providers, expected }) => {
      it(`should create manager with ${name}`, () => {
        const manager = new SecretManager(providers());
        expect(manager.getProviderNames()).toEqual(expected);
      });
    });

    it('should create manager with registry', () => {
      const manager = new SecretManager([], registry);
      expect(manager.getProviderNames()).toEqual([]);
    });

    it('should create manager with both providers and registry', () => {
      const inlineProvider = createInlineProvider(testData.simple);
      const envProvider = createInlineProvider({ API_KEY: 'other' });
      registry.register('inline-alt', envProvider);

      const manager = new SecretManager([inlineProvider], registry);
      expect(manager.getProviderNames()).toEqual(['inline', 'inline']);
    });
  });

  describe('Provider Management', () => {
    it('should handle adding, removing, and duplicate providers', () => {
      const manager = new SecretManager();
      const inlineProvider = createInlineProvider(testData.simple);

      // Adding providers
      manager.addProvider(inlineProvider);
      expect(manager.getProviderNames()).toEqual(['inline']);

      manager.addProvider(createInlineProvider({ API_KEY: 'override' }));
      expect(manager.getProviderNames()).toEqual(['inline', 'inline']);

      // Removing providers - existing vs non-existent
      const removed = manager.removeProvider('inline');
      expect(removed).toBe(true);
      expect(manager.getProviderNames()).toEqual([]);

      manager.addProvider(createInlineProvider(testData.simple));
      const notRemoved = manager.removeProvider('missing');
      expect(notRemoved).toBe(false);
      expect(manager.getProviderNames()).toEqual(['inline']);
    });
  });

  describe('Secret Resolution', () => {
    const resolutionCases = [
      {
        name: 'single provider',
        providers: () => [createInlineProvider({ API_KEY: 'inline-key' })],
        expected: { API_KEY: 'inline-key' },
      },
      {
        name: 'multiple providers with merging',
        providers: () => [
          createInlineProvider(testData.override.base),
          createInlineProvider(testData.override.overriding),
        ],
        expected: testData.override.expected,
      },
      {
        name: 'provider precedence (later overrides earlier)',
        providers: () => [
          createInlineProvider(testData.precedence.first),
          createInlineProvider(testData.precedence.second),
        ],
        expected: testData.precedence.expected,
      },
      {
        name: 'empty provider list',
        providers: () => [],
        expected: {},
      },
      {
        name: 'providers returning empty secrets',
        providers: () => [
          createInlineProvider({}),
          createInlineProvider(testData.simple),
        ],
        expected: testData.simple,
      },
    ];

    resolutionCases.forEach(({ name, providers, expected }) => {
      it(`should resolve secrets from ${name}`, async () => {
        const manager = new SecretManager(providers());
        const result = await manager.resolveSecrets();
        expect(result).toEqual(expected);
      });
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

    it('should handle concurrent resolution calls', async () => {
      const manager = new SecretManager([
        createInlineProvider(testData.simple),
      ]);

      const [first, second, third] = await Promise.all([
        manager.resolveSecrets(),
        manager.resolveSecrets(),
        manager.resolveSecrets(),
      ]);

      expect(first.API_KEY).toBe('test-key');
      expect(second.API_KEY).toBe('test-key');
      expect(third.API_KEY).toBe('test-key');
    });
  });

  describe('Caching', () => {
    it('should provide cache lifecycle with clearing functionality', async () => {
      const provider = createInlineProvider({ KEY: 'value' });
      const resolveSpy = vi.spyOn(provider, 'resolveSecrets');
      const manager = new SecretManager([provider], undefined, {
        cacheTtl: 500,
      });

      // First resolution and cache info validation
      const firstResolution = await manager.resolveSecrets();
      const cacheInfoBeforeClear = manager.getCacheInfo();

      expect(firstResolution).toEqual({ KEY: 'value' });
      expect(resolveSpy).toHaveBeenCalledTimes(1);
      expect(cacheInfoBeforeClear?.valid).toBe(true);
      expect(cacheInfoBeforeClear?.ttl).toBe(500);

      // Cache clearing and re-resolution
      manager.clearCache();
      expect(manager.getCacheInfo()).toBeNull();

      const secondResolution = await manager.resolveSecrets();
      expect(secondResolution).toEqual({ KEY: 'value' });
      expect(resolveSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Registry Integration', () => {
    it('should handle registry operations and provider lifecycle', () => {
      const inlineProvider = createInlineProvider({ KEY: 'value' });
      const dotEnvPath = writeEnvFile(workDir, '.env.basic', [
        'DOT_KEY=dot-value',
      ]);
      const dotEnvProvider = createDotEnvProvider(dotEnvPath);

      // Registration and retrieval
      registry.register('inline', inlineProvider);
      registry.register('dotenv', dotEnvProvider);

      expect(registry.get('inline')).toBe(inlineProvider);
      expect(registry.get('dotenv')).toBe(dotEnvProvider);
      expect(registry.get('missing')).toBeUndefined();
      expect(registry.getAll().size).toBe(2);

      // Duplicate registration prevention
      expect(() => {
        registry.register('inline', createInlineProvider({ KEY: 'other' }));
      }).toThrow("Secret provider 'inline' is already registered");
    });

    it('should integrate registry with SecretManager for secret resolution', async () => {
      const inlineProvider = createInlineProvider({ API_KEY: 'inline-key' });
      const envPath = writeEnvFile(workDir, '.env.inline', [
        'API_KEY=dotenv-key',
        'NEW_SECRET=dotenv-secret',
      ]);
      const dotEnvProvider = createDotEnvProvider(envPath);

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
      expect(manager.getProviderNames()).toEqual(['inline']);

      const secrets = await manager.resolveSecrets();
      expect(secrets).toEqual({ TOKEN: 'value' });
    });
  });

  describe('Type Safety and Interface Compliance', () => {
    it('should ensure proper interfaces and type safety', async () => {
      // Resolved secrets structure validation
      const manager = new SecretManager([
        createInlineProvider(testData.simple),
      ]);
      const result = await manager.resolveSecrets();

      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
      Object.values(result).forEach((value) => {
        expect(typeof value).toBe('string');
      });

      // Provider interface compliance
      const provider: ISecretProvider = createInlineProvider({ KEY: 'value' });
      expect(provider.getName()).toBe('inline');
      expect(provider.resolveSecrets()).toBeInstanceOf(Promise);
      expect(await provider.resolveSecrets()).toEqual({ KEY: 'value' });

      // Registry interface compliance
      const reg: ISecretProviderRegistry = registry;
      expect(() => reg.register('test', provider)).not.toThrow();
      expect(reg.get('test')).toBe(provider);
      expect(reg.getAll()).toBeInstanceOf(Map);
    });
  });
});
