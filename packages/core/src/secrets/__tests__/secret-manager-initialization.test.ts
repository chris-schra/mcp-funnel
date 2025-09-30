import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecretManager } from '../secret-manager.js';
import { SecretProviderRegistry } from '../secret-provider-registry.js';
import { ProcessEnvProvider } from '../process-env-provider.js';
import { createInlineProvider } from './secret-manager-test-utils.js';

describe('SecretManager - Initialization', () => {
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