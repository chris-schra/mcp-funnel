import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecretManager } from '../secret-manager.js';
import { SecretProviderRegistry } from '../secret-provider-registry.js';
import { createInlineProvider } from './secret-manager-test-utils.js';

describe('SecretManager - Edge Cases and Error Handling', () => {
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
    const provider = createInlineProvider({ KEY: 'value' });

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