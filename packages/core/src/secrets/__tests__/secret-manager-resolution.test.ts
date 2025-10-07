import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecretManager } from '../secret-manager.js';
import { SecretProviderRegistry } from '../secret-provider-registry.js';
import {
  ThrowingProvider,
  DelayedProvider,
  createInlineProvider,
} from './secret-manager-test-utils.js';

describe('SecretManager - Secret Resolution', () => {
  let _registry: SecretProviderRegistry;
  let originalEnv: NodeJS.ProcessEnv;
  let workDir: string;

  beforeEach(() => {
    _registry = new SecretProviderRegistry();
    originalEnv = { ...process.env };
    workDir = mkdtempSync(join(tmpdir(), 'secret-manager-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(workDir, { recursive: true, force: true });
  });

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
    const failing = new ThrowingProvider('failing', new Error('intentional failure'));
    const manager = new SecretManager([healthy, failing]);

    const result = await manager.resolveSecrets();

    expect(result).toEqual({ HEALTHY_KEY: 'value' });
  });

  it('should handle all providers failing gracefully', async () => {
    const failing = new ThrowingProvider('failing', new Error('intentional failure'));
    const manager = new SecretManager([failing]);

    const result = await manager.resolveSecrets();

    expect(result).toEqual({});
  });

  it('should support async resolution with real async behavior', async () => {
    const delayed = new DelayedProvider('delayed-inline', { SLOW_KEY: 'value' }, 15);
    const manager = new SecretManager([delayed]);

    const startTime = Date.now();
    const result = await manager.resolveSecrets();
    const elapsed = Date.now() - startTime;

    expect(result.SLOW_KEY).toBe('value');
    expect(elapsed).toBeGreaterThanOrEqual(10);
  });
});
