import { describe, it, expect, beforeEach } from 'vitest';
import type { IRegistryCache } from '../interfaces/cache.interface.js';

/**
 * Mock NoOpCache implementation for testing purposes.
 *
 * This is a temporary implementation used to test the cache interface contract
 * before the actual NoOpCache class is implemented. The real NoOpCache will
 * follow the same interface but will be located in a separate implementation file.
 *
 * This no-op implementation:
 * - Always returns null for get() operations
 * - Accepts but ignores all set() operations
 * - Always returns false for has() checks
 * - Silently ignores delete() and clear() operations
 * - Accepts TTL parameters but ignores them entirely
 */
class MockNoOpCache<T = unknown> implements IRegistryCache<T> {
  async get(_key: string): Promise<T | null> {
    return null;
  }

  async set(_key: string, _value: T, _ttlMs?: number): Promise<void> {
    // No-op: accept values but don't store them
    return;
  }

  async has(_key: string): Promise<boolean> {
    return false;
  }

  async delete(_key: string): Promise<void> {
    // No-op: silently ignore deletion requests
    return;
  }

  async clear(): Promise<void> {
    // No-op: silently ignore clear requests
    return;
  }
}

describe('NoOpCache', () => {
  let cache: IRegistryCache<unknown>;

  beforeEach(() => {
    cache = new MockNoOpCache();
  });

  describe('get() method', () => {
    it('should always return null for any key', async () => {
      // Test that get always returns null regardless of key
      expect(await cache.get('any-key')).toBeNull();
      expect(await cache.get('tool:github__create_issue')).toBeNull();
      expect(await cache.get('registry:servers')).toBeNull();
      expect(await cache.get('')).toBeNull();
      expect(await cache.get('some-very-long-key-name-that-might-exist')).toBeNull();
    });

    it('should return null even after setting values', async () => {
      // Verify that get returns null even after attempting to set values
      await cache.set('test-key', { data: 'value' });
      expect(await cache.get('test-key')).toBeNull();

      await cache.set('another-key', 'string-value', 5000);
      expect(await cache.get('another-key')).toBeNull();
    });
  });

  describe('set() method', () => {
    it('should accept values without error', async () => {
      // Test that set operations complete without throwing
      await expect(cache.set('key1', 'string-value')).resolves.not.toThrow();
      await expect(cache.set('key2', { complex: 'object' })).resolves.not.toThrow();
      await expect(cache.set('key3', 12345)).resolves.not.toThrow();
      await expect(cache.set('key4', null)).resolves.not.toThrow();
      await expect(cache.set('key5', undefined)).resolves.not.toThrow();
    });

    it('should accept TTL parameter but ignore it', async () => {
      // Test that TTL parameter is accepted but has no effect
      await expect(cache.set('key-with-ttl', 'value', 1000)).resolves.not.toThrow();
      await expect(cache.set('key-no-ttl', 'value')).resolves.not.toThrow();
      await expect(cache.set('key-zero-ttl', 'value', 0)).resolves.not.toThrow();
      await expect(cache.set('key-negative-ttl', 'value', -1)).resolves.not.toThrow();

      // Verify that values are still not stored regardless of TTL
      expect(await cache.get('key-with-ttl')).toBeNull();
      expect(await cache.get('key-no-ttl')).toBeNull();
    });

    it('should not store values (verified through get)', async () => {
      // Double-check that set does not actually store anything
      const testData = { id: 1, name: 'test', tools: ['tool1', 'tool2'] };
      await cache.set('complex-object', testData);
      expect(await cache.get('complex-object')).toBeNull();

      await cache.set('simple-string', 'hello world');
      expect(await cache.get('simple-string')).toBeNull();
    });
  });

  describe('has() method', () => {
    it('should always return false for any key', async () => {
      // Test that has always returns false regardless of key
      expect(await cache.has('any-key')).toBe(false);
      expect(await cache.has('tool:github__create_issue')).toBe(false);
      expect(await cache.has('registry:servers')).toBe(false);
      expect(await cache.has('')).toBe(false);
    });

    it('should return false even after setting values', async () => {
      // Verify that has returns false even after attempting to set values
      await cache.set('test-key', { data: 'value' });
      expect(await cache.has('test-key')).toBe(false);

      await cache.set('another-key', 'string-value', 5000);
      expect(await cache.has('another-key')).toBe(false);
    });
  });

  describe('delete() method', () => {
    it('should not error when deleting non-existent keys', async () => {
      // Test that delete operations complete without throwing for any key
      await expect(cache.delete('non-existent-key')).resolves.not.toThrow();
      await expect(cache.delete('tool:github__create_issue')).resolves.not.toThrow();
      await expect(cache.delete('')).resolves.not.toThrow();
      await expect(cache.delete('some-random-key')).resolves.not.toThrow();
    });

    it('should not error when deleting after setting values', async () => {
      // Even though values aren't stored, delete should still not error
      await cache.set('test-key', 'value');
      await expect(cache.delete('test-key')).resolves.not.toThrow();

      // Key should still not exist (since it was never actually stored)
      expect(await cache.has('test-key')).toBe(false);
      expect(await cache.get('test-key')).toBeNull();
    });
  });

  describe('clear() method', () => {
    it('should not error when clearing empty cache', async () => {
      // Test that clear operations complete without throwing
      await expect(cache.clear()).resolves.not.toThrow();
    });

    it('should not error when clearing after setting values', async () => {
      // Even though values aren't stored, clear should still not error
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await expect(cache.clear()).resolves.not.toThrow();

      // Keys should still not exist (since they were never actually stored)
      expect(await cache.has('key1')).toBe(false);
      expect(await cache.has('key2')).toBe(false);
    });

    it('should be safe to call multiple times', async () => {
      // Test that multiple clear calls don't cause issues
      await expect(cache.clear()).resolves.not.toThrow();
      await expect(cache.clear()).resolves.not.toThrow();
      await expect(cache.clear()).resolves.not.toThrow();
    });
  });

  describe('Type safety and generics', () => {
    it('should work with typed generic cache instances', async () => {
      // Test type safety with specific generic types
      interface ToolData {
        name: string;
        server: string;
        description: string;
      }

      const typedCache: IRegistryCache<ToolData> = new MockNoOpCache<ToolData>();

      const toolData: ToolData = {
        name: 'create_issue',
        server: 'github',
        description: 'Creates a GitHub issue',
      };

      await expect(typedCache.set('tool:github__create_issue', toolData)).resolves.not.toThrow();
      expect(await typedCache.get('tool:github__create_issue')).toBeNull();
      expect(await typedCache.has('tool:github__create_issue')).toBe(false);
    });

    it('should work with primitive types', async () => {
      // Test with string cache
      const stringCache: IRegistryCache<string> = new MockNoOpCache<string>();
      await stringCache.set('string-key', 'hello world');
      expect(await stringCache.get('string-key')).toBeNull();

      // Test with number cache
      const numberCache: IRegistryCache<number> = new MockNoOpCache<number>();
      await numberCache.set('number-key', 42);
      expect(await numberCache.get('number-key')).toBeNull();

      // Test with boolean cache
      const booleanCache: IRegistryCache<boolean> = new MockNoOpCache<boolean>();
      await booleanCache.set('boolean-key', true);
      expect(await booleanCache.get('boolean-key')).toBeNull();
    });

    it('should work with union types', async () => {
      // Test with union type cache
      type CacheValue = string | number | { id: number; name: string };
      const unionCache: IRegistryCache<CacheValue> = new MockNoOpCache<CacheValue>();

      await unionCache.set('string-value', 'test');
      await unionCache.set('number-value', 123);
      await unionCache.set('object-value', { id: 1, name: 'test' });

      expect(await unionCache.get('string-value')).toBeNull();
      expect(await unionCache.get('number-value')).toBeNull();
      expect(await unionCache.get('object-value')).toBeNull();
    });
  });

  describe('TTL behavior verification', () => {
    it('should accept various TTL values without error', async () => {
      // Test that different TTL values are accepted
      await expect(cache.set('ttl-1000', 'value', 1000)).resolves.not.toThrow();
      await expect(cache.set('ttl-60000', 'value', 60000)).resolves.not.toThrow();
      await expect(cache.set('ttl-0', 'value', 0)).resolves.not.toThrow();
      await expect(cache.set('ttl-negative', 'value', -1)).resolves.not.toThrow();
      await expect(cache.set('ttl-undefined', 'value', undefined)).resolves.not.toThrow();
    });

    it('should ignore TTL and not store values regardless', async () => {
      // Verify that even with very long TTL, values are not stored
      await cache.set('long-ttl-key', 'value', 24 * 60 * 60 * 1000); // 24 hours
      expect(await cache.get('long-ttl-key')).toBeNull();
      expect(await cache.has('long-ttl-key')).toBe(false);

      // Verify that even with no TTL, values are not stored
      await cache.set('no-ttl-key', 'value');
      expect(await cache.get('no-ttl-key')).toBeNull();
      expect(await cache.has('no-ttl-key')).toBe(false);
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should handle empty string keys gracefully', async () => {
      // Test operations with empty string keys
      await expect(cache.set('', 'value')).resolves.not.toThrow();
      expect(await cache.get('')).toBeNull();
      expect(await cache.has('')).toBe(false);
      await expect(cache.delete('')).resolves.not.toThrow();
    });

    it('should handle very long keys gracefully', async () => {
      // Test operations with very long keys
      const longKey = 'a'.repeat(1000);
      await expect(cache.set(longKey, 'value')).resolves.not.toThrow();
      expect(await cache.get(longKey)).toBeNull();
      expect(await cache.has(longKey)).toBe(false);
      await expect(cache.delete(longKey)).resolves.not.toThrow();
    });

    it('should handle special characters in keys gracefully', async () => {
      // Test operations with keys containing special characters
      const specialKeys = [
        'key:with:colons',
        'key/with/slashes',
        'key with spaces',
        'key-with-dashes',
        'key_with_underscores',
        'key.with.dots',
        'key@with@symbols',
        'key#with#hash',
        'key?with?query',
        'key&with&ampersand',
      ];

      for (const key of specialKeys) {
        await expect(cache.set(key, 'value')).resolves.not.toThrow();
        expect(await cache.get(key)).toBeNull();
        expect(await cache.has(key)).toBe(false);
        await expect(cache.delete(key)).resolves.not.toThrow();
      }
    });

    it('should handle concurrent operations gracefully', async () => {
      // Test concurrent operations to ensure no race conditions
      const promises = [];

      // Create multiple concurrent operations
      for (let i = 0; i < 10; i++) {
        promises.push(cache.set(`concurrent-key-${i}`, `value-${i}`));
        promises.push(cache.get(`concurrent-key-${i}`));
        promises.push(cache.has(`concurrent-key-${i}`));
        promises.push(cache.delete(`concurrent-key-${i}`));
      }

      // All operations should complete without error
      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });
});
