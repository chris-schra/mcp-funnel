/**
 * Tests for ReconnectionManager - Error Handling
 */

import { describe, it, expect, vi } from 'vitest';
import { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { setupTimers } from './test-utils.js';

describe('ReconnectionManager - Error Handling', () => {
  setupTimers();

  it('propagates errors from connectFn', async () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 100,
      jitter: 0,
    });
    const error = new Error('Connection failed');
    const connectFn = vi.fn().mockRejectedValue(error);

    // First attempt uses retryCount=0, delay = 100 * 2^0 = 100ms
    const promise = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow('Connection failed');
  });

  it('maintains retry count after failed connection attempt', async () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 100,
      jitter: 0,
    });
    const connectFn = vi.fn().mockRejectedValue(new Error('Failed'));

    // First attempt uses retryCount=0, delay = 100 * 2^0 = 100ms
    const promise = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(100);

    try {
      await promise;
    } catch {
      // Expected
    }

    expect(manager.currentRetryCount).toBe(1);
  });
});
