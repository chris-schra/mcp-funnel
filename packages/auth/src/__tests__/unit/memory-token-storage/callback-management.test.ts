import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ITokenStorage } from '@mcp-funnel/core';
import { createMemoryTokenStorage } from '../../../implementations/memory-token-storage.js';
import {
  mockSetTimeout,
  mockClearTimeout,
  setupMockTimers,
  restoreTimers,
  createTestToken,
} from './test-utils.js';

describe('Callback Management', () => {
  let storage: ITokenStorage;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    vi.clearAllMocks();
    const timers = setupMockTimers();
    originalSetTimeout = timers.originalSetTimeout;
    originalClearTimeout = timers.originalClearTimeout;

    // Create new storage instance for each test
    storage = createMemoryTokenStorage();
  });

  afterEach(() => {
    restoreTimers(originalSetTimeout, originalClearTimeout);
  });

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

    expect(mockClearTimeout).toHaveBeenCalledWith(expect.objectContaining({ id: firstTimerId }));
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

    expect(mockClearTimeout).toHaveBeenCalledWith(expect.objectContaining({ id: timerId }));
  });

  it('should handle refresh callback that throws error', async () => {
    const refreshCallback = vi.fn().mockRejectedValue(new Error('Refresh failed'));
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
      const latestCall = mockSetTimeout.mock.calls[mockSetTimeout.mock.calls.length - 1];
      const scheduledCallback = latestCall[0];
      await scheduledCallback();

      expect(callback2).toHaveBeenCalled();
      expect(callback1).not.toHaveBeenCalled();
    }
  });
});
