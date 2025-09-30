import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecretManager } from '../secret-manager.js';
import { createInlineProvider } from './secret-manager-test-utils.js';

describe('SecretManager - Caching', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let workDir: string;

  beforeEach(() => {
    originalEnv = { ...process.env };
    workDir = mkdtempSync(join(tmpdir(), 'secret-manager-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(workDir, { recursive: true, force: true });
  });

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
    const manager = new SecretManager([createInlineProvider({ KEY: 'value' })]);

    await manager.resolveSecrets();
    manager.clearCache();

    const result = await manager.resolveSecrets();
    expect(result).toEqual({ KEY: 'value' });
  });
});
