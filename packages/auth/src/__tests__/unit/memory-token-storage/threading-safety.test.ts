import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ITokenStorage } from '@mcp-funnel/core';
import { createMemoryTokenStorage } from '../../../implementations/memory-token-storage.js';
import {
  createTestToken,
  setupMockTimers,
  restoreTimers,
} from './test-utils.js';

describe('MemoryTokenStorage', () => {
  let storage: ITokenStorage;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    // Setup mock timers
    const timers = setupMockTimers();
    originalSetTimeout = timers.originalSetTimeout;
    originalClearTimeout = timers.originalClearTimeout;

    // Create new storage instance for each test
    storage = createMemoryTokenStorage();
  });

  afterEach(() => {
    restoreTimers(originalSetTimeout, originalClearTimeout);
  });

  describe('Threading Safety', () => {
    it('should handle concurrent store operations', async () => {
      const token1 = createTestToken();
      const token2 = createTestToken();

      const storePromises = [storage.store(token1), storage.store(token2)];

      await Promise.all(storePromises);

      const retrieved = await storage.retrieve();
      expect(retrieved).toBeDefined();
      expect([token1.accessToken, token2.accessToken]).toContain(
        retrieved?.accessToken,
      );
    });

    it('should handle concurrent retrieve operations', async () => {
      const token = createTestToken();
      await storage.store(token);

      const retrievePromises = [
        storage.retrieve(),
        storage.retrieve(),
        storage.retrieve(),
      ];

      const results = await Promise.all(retrievePromises);

      results.forEach((result) => {
        expect(result).toEqual(token);
      });
    });

    it('should handle concurrent store and retrieve operations', async () => {
      const token = createTestToken();

      const operations = [
        storage.store(token),
        storage.retrieve(),
        storage.isExpired(),
      ];

      await expect(Promise.all(operations)).resolves.not.toThrow();
    });

    it('should handle concurrent clear operations', async () => {
      const token = createTestToken();
      await storage.store(token);

      const clearPromises = [storage.clear(), storage.clear(), storage.clear()];

      await expect(Promise.all(clearPromises)).resolves.not.toThrow();

      const retrieved = await storage.retrieve();
      expect(retrieved).toBeNull();
    });

    it('should handle mixed concurrent operations', async () => {
      const token1 = createTestToken();
      const token2 = createTestToken();

      const operations = [
        storage.store(token1),
        storage.retrieve(),
        storage.store(token2),
        storage.isExpired(),
        storage.clear(),
        storage.retrieve(),
      ];

      await expect(Promise.all(operations)).resolves.not.toThrow();
    });
  });
});
