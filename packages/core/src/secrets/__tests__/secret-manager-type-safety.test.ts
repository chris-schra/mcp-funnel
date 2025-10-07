import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ISecretProvider, ISecretProviderRegistry } from '../types.js';
import { SecretManager } from '../secret-manager.js';
import { SecretProviderRegistry } from '../secret-provider-registry.js';
import { createInlineProvider } from './secret-manager-test-utils.js';

describe('SecretManager - Type Safety and Interface Compliance', () => {
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

  it('should ensure resolved secrets structure', async () => {
    const manager = new SecretManager([createInlineProvider({ API_KEY: 'value' })]);

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
