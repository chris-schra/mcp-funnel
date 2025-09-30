import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';
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

  describe('Expiry Management', () => {
    it('should correctly identify non-expired token', async () => {
      const token = createTestToken(3600000); // expires in 1 hour

      await storage.store(token);
      const isExpired = await storage.isExpired();

      expect(isExpired).toBe(false);
    });

    it('should correctly identify expired token', async () => {
      const token = createTestToken(-1000); // expired 1 second ago

      await storage.store(token);
      const isExpired = await storage.isExpired();

      expect(isExpired).toBe(true);
    });

    it('should return true for expired when no token is stored', async () => {
      const isExpired = await storage.isExpired();

      expect(isExpired).toBe(true);
    });

    it('should handle edge case of token expiring exactly now', async () => {
      const token = createTestToken(0); // expires now

      await storage.store(token);
      const isExpired = await storage.isExpired();

      expect(isExpired).toBe(true);
    });

    it('should check expiry with buffer time for proactive refresh', async () => {
      // Token expires in 5 minutes, but with 10-minute buffer should be considered expired
      const token = createTestToken(5 * 60 * 1000);

      await storage.store(token);
      const isExpired = await storage.isExpired();

      // With buffer, this should be considered expired for proactive refresh
      expect(isExpired).toBe(true);
    });

    it('should handle invalid expiry dates gracefully', async () => {
      const token: TokenData = {
        accessToken: 'test-token',
        expiresAt: new Date('invalid-date'),
        tokenType: 'Bearer',
      };

      await storage.store(token);
      const isExpired = await storage.isExpired();

      expect(isExpired).toBe(true); // invalid date should be treated as expired
    });
  });
});
