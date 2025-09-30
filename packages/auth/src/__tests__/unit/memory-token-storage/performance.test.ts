import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ITokenStorage } from '@mcp-funnel/core';
import { createMemoryTokenStorage } from '../../../implementations/memory-token-storage.js';
import {
  createTestToken,
  setupMockTimers,
  restoreTimers,
} from './test-utils.js';

describe('Performance', () => {
  let storage: ITokenStorage;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    // Setup mock timers
    const timers = setupMockTimers();
    originalSetTimeout = timers.originalSetTimeout;
    originalClearTimeout = timers.originalClearTimeout;

    vi.clearAllMocks();

    // Create new storage instance for each test
    storage = createMemoryTokenStorage();
  });

  afterEach(() => {
    restoreTimers(originalSetTimeout, originalClearTimeout);
  });

  it('should handle storage of large tokens efficiently', async () => {
    const largeToken = createTestToken();
    largeToken.accessToken = 'x'.repeat(10000); // 10KB token
    largeToken.scope = 'scope '.repeat(1000); // Large scope

    const startTime = performance.now();
    await storage.store(largeToken);
    const storeTime = performance.now() - startTime;

    const retrieveStart = performance.now();
    const retrieved = await storage.retrieve();
    const retrieveTime = performance.now() - retrieveStart;

    expect(retrieved).toEqual(largeToken);
    expect(storeTime).toBeLessThan(100); // Should be fast
    expect(retrieveTime).toBeLessThan(100); // Should be fast
  });

  it('should handle rapid successive operations efficiently', async () => {
    const operations = [];
    const numOperations = 1000;

    const startTime = performance.now();

    for (let i = 0; i < numOperations; i++) {
      const token = createTestToken();
      operations.push(
        storage
          .store(token)
          .then(() => storage.retrieve())
          .then(() => storage.isExpired()),
      );
    }

    await Promise.all(operations);
    const totalTime = performance.now() - startTime;

    expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
  });

  it('should not leak memory with repeated operations', async () => {
    const iterations = 100;
    let initialMemory: number | undefined;
    const globalWithGc = global as typeof global & { gc?: () => void };

    for (let i = 0; i < iterations; i++) {
      const token = createTestToken();
      await storage.store(token);
      await storage.retrieve();
      await storage.clear();

      if (i === 10 && globalWithGc.gc) {
        globalWithGc.gc();
        initialMemory = process.memoryUsage().heapUsed;
      }
    }

    if (initialMemory && globalWithGc.gc) {
      globalWithGc.gc();
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be minimal (less than 1MB)
      expect(memoryGrowth).toBeLessThan(1024 * 1024);
    }
  });
});
