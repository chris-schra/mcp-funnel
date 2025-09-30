import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecretManager } from '../secret-manager.js';
import { SecretProviderRegistry } from '../secret-provider-registry.js';
import { createInlineProvider } from './secret-manager-test-utils.js';

describe('SecretManager - Provider Registration', () => {
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