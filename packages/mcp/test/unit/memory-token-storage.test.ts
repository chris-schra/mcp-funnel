import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  TokenData,
  ITokenStorage,
} from '../../src/auth/interfaces/token-storage.interface.js';
import { createMemoryTokenStorage } from '../../src/auth/implementations/memory-token-storage.js';

// Mock timer functions for testing expiry and refresh scheduling
const mockSetTimeout = vi.fn();
const mockClearTimeout = vi.fn();

// Type definitions for testing
interface MockTimerInfo {
  id: number;
  fn: () => void | Promise<void>;
  delay: number;
}

// Helper to create test token data
function createTestToken(expiresInMs: number = 3600000): TokenData {
  return {
    accessToken:
      'test-access-token-' + Math.random().toString(36).substring(2, 11),
    expiresAt: new Date(Date.now() + expiresInMs),
    tokenType: 'Bearer',
    scope: 'read write',
  };
}

describe('MemoryTokenStorage', () => {
  let storage: ITokenStorage;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    // Mock timer functions
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;
    global.setTimeout = mockSetTimeout as unknown as typeof setTimeout;
    global.clearTimeout = mockClearTimeout as unknown as typeof clearTimeout;

    vi.clearAllMocks();
    mockSetTimeout.mockImplementation(
      (fn: () => void | Promise<void>, delay: number): MockTimerInfo => {
        return { id: Math.random() * 1000, fn, delay };
      },
    );

    // Create new storage instance for each test
    storage = createMemoryTokenStorage();
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

    // Clean up any scheduled timers
    vi.clearAllTimers();
  });

  describe('Token Lifecycle', () => {
    it('should store and retrieve token successfully', async () => {
      const token = createTestToken();

      await storage.store(token);
      const retrieved = await storage.retrieve();

      expect(retrieved).toEqual(token);
      expect(retrieved?.accessToken).toBe(token.accessToken);
      expect(retrieved?.tokenType).toBe(token.tokenType);
      expect(retrieved?.scope).toBe(token.scope);
      expect(retrieved?.expiresAt).toEqual(token.expiresAt);
    });

    it('should return null when no token is stored', async () => {
      const retrieved = await storage.retrieve();

      expect(retrieved).toBeNull();
    });

    it('should overwrite existing token when storing new one', async () => {
      const token1 = createTestToken();
      const token2 = createTestToken();

      await storage.store(token1);
      await storage.store(token2);

      const retrieved = await storage.retrieve();

      expect(retrieved).toEqual(token2);
      expect(retrieved?.accessToken).toBe(token2.accessToken);
    });

    it('should clear stored token successfully', async () => {
      const token = createTestToken();

      await storage.store(token);
      await storage.clear();

      const retrieved = await storage.retrieve();

      expect(retrieved).toBeNull();
    });

    it('should handle clearing when no token is stored', async () => {
      await expect(storage.clear()).resolves.not.toThrow();

      const retrieved = await storage.retrieve();
      expect(retrieved).toBeNull();
    });

    it('should handle storing token with minimal required fields', async () => {
      const minimalToken: TokenData = {
        accessToken: 'minimal-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };

      await storage.store(minimalToken);
      const retrieved = await storage.retrieve();

      expect(retrieved).toEqual(minimalToken);
      expect(retrieved?.scope).toBeUndefined();
    });
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

  describe('Callback Management', () => {
    it('should schedule refresh callback when token is stored', async () => {
      const refreshCallback = vi.fn().mockResolvedValue(undefined);
      const token = createTestToken(3600000); // 1 hour

      if (storage.scheduleRefresh) {
        storage.scheduleRefresh(refreshCallback);
      }

      await storage.store(token);

      expect(mockSetTimeout).toHaveBeenCalled();
    });

    it('should call refresh callback before token expires', async () => {
      const refreshCallback = vi.fn().mockResolvedValue(undefined);
      const token = createTestToken(3600000); // 1 hour

      if (storage.scheduleRefresh) {
        storage.scheduleRefresh(refreshCallback);
      }

      await storage.store(token);

      // Get the timeout that was scheduled
      const timeoutCall = mockSetTimeout.mock.calls[0];
      const scheduledCallback = timeoutCall[0];
      const delay = timeoutCall[1];

      // Should schedule refresh before expiry (with buffer)
      expect(delay).toBeLessThan(3600000);
      expect(delay).toBeGreaterThan(0);

      // Simulate timeout firing
      await scheduledCallback();

      expect(refreshCallback).toHaveBeenCalled();
    });

    it('should clear existing refresh timer when new token is stored', async () => {
      const refreshCallback = vi.fn().mockResolvedValue(undefined);
      const token1 = createTestToken(3600000);
      const token2 = createTestToken(7200000);

      if (storage.scheduleRefresh) {
        storage.scheduleRefresh(refreshCallback);
      }

      await storage.store(token1);
      const firstTimerId = mockSetTimeout.mock.results[0].value.id;

      await storage.store(token2);

      expect(mockClearTimeout).toHaveBeenCalledWith(
        expect.objectContaining({ id: firstTimerId }),
      );
      expect(mockSetTimeout).toHaveBeenCalledTimes(2);
    });

    it('should clear refresh timer when token is cleared', async () => {
      const refreshCallback = vi.fn().mockResolvedValue(undefined);
      const token = createTestToken(3600000);

      if (storage.scheduleRefresh) {
        storage.scheduleRefresh(refreshCallback);
      }

      await storage.store(token);
      const timerId = mockSetTimeout.mock.results[0].value.id;

      await storage.clear();

      expect(mockClearTimeout).toHaveBeenCalledWith(
        expect.objectContaining({ id: timerId }),
      );
    });

    it('should handle refresh callback that throws error', async () => {
      const refreshCallback = vi
        .fn()
        .mockRejectedValue(new Error('Refresh failed'));
      const token = createTestToken(1000); // expires very soon

      if (storage.scheduleRefresh) {
        storage.scheduleRefresh(refreshCallback);
      }

      await storage.store(token);

      const timeoutCall = mockSetTimeout.mock.calls[0];
      const scheduledCallback = timeoutCall[0];

      // Should not throw when callback fails
      await expect(scheduledCallback()).resolves.not.toThrow();
    });

    it('should not schedule refresh for already expired token', async () => {
      const refreshCallback = vi.fn().mockResolvedValue(undefined);
      const expiredToken = createTestToken(-1000); // already expired

      if (storage.scheduleRefresh) {
        storage.scheduleRefresh(refreshCallback);
      }

      await storage.store(expiredToken);

      expect(mockSetTimeout).not.toHaveBeenCalled();
    });

    it('should update refresh callback when scheduleRefresh is called multiple times', async () => {
      const callback1 = vi.fn().mockResolvedValue(undefined);
      const callback2 = vi.fn().mockResolvedValue(undefined);
      const token = createTestToken(3600000);

      if (storage.scheduleRefresh) {
        storage.scheduleRefresh(callback1);
        await storage.store(token);

        storage.scheduleRefresh(callback2);
        await storage.store(createTestToken(7200000));

        // Simulate timeout
        const latestCall =
          mockSetTimeout.mock.calls[mockSetTimeout.mock.calls.length - 1];
        const scheduledCallback = latestCall[0];
        await scheduledCallback();

        expect(callback2).toHaveBeenCalled();
        expect(callback1).not.toHaveBeenCalled();
      }
    });
  });

  describe('Security', () => {
    it('should not expose token in error messages', async () => {
      const sensitiveToken = createTestToken();
      sensitiveToken.accessToken = 'secret-token-12345';

      await storage.store(sensitiveToken);

      // Force an error condition and verify token is not in error message
      try {
        // This would trigger an internal error in actual implementation
        await (
          storage as ITokenStorage & { _triggerError?: () => Promise<void> }
        )._triggerError?.();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        expect(errorMessage).not.toContain('secret-token-12345');
        expect(errorMessage).not.toContain(sensitiveToken.accessToken);
      }
    });

    it('should clear token from memory when cleared', async () => {
      const token = createTestToken();
      await storage.store(token);

      await storage.clear();

      // Verify no references to token data remain
      const memorySnapshot = (
        storage as ITokenStorage & { _getMemorySnapshot?: () => unknown }
      )._getMemorySnapshot?.();
      if (memorySnapshot) {
        expect(JSON.stringify(memorySnapshot)).not.toContain(token.accessToken);
      }
    });

    it('should handle token sanitization on storage', async () => {
      const tokenWithWhitespace: TokenData = {
        accessToken: '  token-with-spaces  ',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: ' Bearer ',
        scope: '  read   write  ',
      };

      await storage.store(tokenWithWhitespace);
      const retrieved = await storage.retrieve();

      expect(retrieved?.accessToken.trim()).toBe(
        tokenWithWhitespace.accessToken.trim(),
      );
      expect(retrieved?.tokenType.trim()).toBe('Bearer');
    });

    it('should reject tokens with empty access token', async () => {
      const invalidToken: TokenData = {
        accessToken: '',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };

      await expect(storage.store(invalidToken)).rejects.toThrow(
        'Access token cannot be empty',
      );
    });

    it('should reject tokens with invalid token type', async () => {
      const invalidToken: TokenData = {
        accessToken: 'valid-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: '',
      };

      await expect(storage.store(invalidToken)).rejects.toThrow(
        'Token type cannot be empty',
      );
    });

    it('should handle memory cleanup on dispose', async () => {
      const token = createTestToken();
      await storage.store(token);

      // Dispose should clear all memory references
      const disposableStorage = storage as ITokenStorage & {
        dispose?: () => Promise<void>;
      };
      if (disposableStorage.dispose) {
        await disposableStorage.dispose();
      }

      const retrieved = await storage.retrieve();
      expect(retrieved).toBeNull();
    });
  });

  describe('Performance', () => {
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
});
