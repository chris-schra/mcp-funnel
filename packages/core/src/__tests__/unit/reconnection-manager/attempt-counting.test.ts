/**
 * Tests for ReconnectionManager - Attempt Counting
 */

import { describe, it, expect, vi } from 'vitest';
import { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { setupTimers } from './test-utils.js';

describe('ReconnectionManager - Attempt Counting', () => {
  setupTimers();

  it('starts with zero attempts', () => {
    const manager = new ReconnectionManager();
    expect(manager.getAttemptCount()).toBe(0);
  });

  it('increments attempts on each reconnection', async () => {
    const manager = new ReconnectionManager({
      maxAttempts: 3,
      initialDelayMs: 1000,
      jitter: 0,
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);

    // First attempt uses retryCount=0, delay = 1000 * 2^0 = 1000ms
    const promise1 = manager.scheduleReconnect(connectFn);
    expect(manager.currentRetryCount).toBe(1);

    vi.advanceTimersByTime(1000);
    await promise1;

    // Second attempt uses retryCount=1, delay = 1000 * 2^1 = 2000ms
    const promise2 = manager.scheduleReconnect(connectFn);
    expect(manager.currentRetryCount).toBe(2);

    vi.advanceTimersByTime(2000);
    await promise2;
  });

  it('resets attempts to zero', async () => {
    const manager = new ReconnectionManager({ maxAttempts: 3 });
    const connectFn = vi.fn().mockResolvedValue(undefined);

    manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(1000);

    manager.scheduleReconnect(connectFn);
    expect(manager.currentRetryCount).toBe(2);

    manager.reset();
    expect(manager.getAttemptCount()).toBe(0);
  });

  it('exposes hasRetriesLeft property', () => {
    const manager = new ReconnectionManager({ maxAttempts: 2 });
    expect(manager.hasRetriesLeft).toBe(true);

    const connectFn = vi.fn().mockResolvedValue(undefined);
    manager.scheduleReconnect(connectFn);
    expect(manager.hasRetriesLeft).toBe(true);

    manager.scheduleReconnect(connectFn);
    expect(manager.hasRetriesLeft).toBe(false);
  });
});
