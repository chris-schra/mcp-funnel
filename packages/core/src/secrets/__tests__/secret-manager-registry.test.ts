import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecretManager } from '../secret-manager.js';
import { SecretProviderRegistry } from '../secret-provider-registry.js';
import { DotEnvProvider } from '../providers/dotenv/index.js';
import {
  createInlineProvider,
  writeEnvFile,
} from './secret-manager-test-utils.js';

describe('SecretManager - Registry Integration', () => {
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