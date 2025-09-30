/**
 * Tests for ReconnectionManager - Exponential Backoff
 */

import { describe, it, expect, vi } from 'vitest';
import { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { setupTimers } from './test-utils.js';

describe('ReconnectionManager - Exponential Backoff', () => {
  setupTimers();

  it('uses initial delay for first attempt', async () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 1000,
      jitter: 0, // Disable jitter for predictable testing
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);
    const promise = manager.scheduleReconnect(connectFn);

    // Should not call connectFn immediately
    expect(connectFn).not.toHaveBeenCalled();

    // Should call after initial delay
    vi.advanceTimersByTime(1000);
    await promise;
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it('applies exponential backoff for subsequent attempts', async () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      maxAttempts: 5,
      jitter: 0, // Disable jitter for predictable testing
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);

    // First attempt: 1000ms
    const promise1 = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(999);
    expect(connectFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await promise1;
    expect(connectFn).toHaveBeenCalledTimes(1);

    // Second attempt: 2000ms (1000 * 2^1)
    const promise2 = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(1999);
    expect(connectFn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await promise2;
    expect(connectFn).toHaveBeenCalledTimes(2);

    // Third attempt: 4000ms (1000 * 2^2)
    const promise3 = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(3999);
    expect(connectFn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    await promise3;
    expect(connectFn).toHaveBeenCalledTimes(3);
  });

  it('caps delay at maxDelayMs', async () => {
    const manager = new ReconnectionManager({
      maxAttempts: 5,
      initialDelayMs: 1000,
      backoffMultiplier: 10, // Large multiplier to test capping
      maxDelayMs: 3000,
      jitter: 0,
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);

    // First attempt: 1000ms
    const promise1 = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(1000);
    await promise1;

    // Second attempt: would be 10000ms but capped at 3000ms
    const promise2 = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(2999);
    expect(connectFn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await promise2;
    expect(connectFn).toHaveBeenCalledTimes(2);
  });

  it('applies jitter to delays', async () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 1000,
      jitter: 0.25, // ±25%
      maxAttempts: 10,
      backoffMultiplier: 1, // No exponential backoff for jitter test
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);

    // Schedule multiple reconnects and collect delays
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const _promise = manager.scheduleReconnect(connectFn);

      // Advance in small increments to find actual delay
      let elapsed = 0;
      while (elapsed < 2000) {
        vi.advanceTimersByTime(50);
        elapsed += 50;
        if (connectFn.mock.calls.length > i) {
          delays.push(elapsed);
          await _promise;
          break;
        }
      }
    }

    // All delays should be close to 1000ms but not exactly the same
    expect(delays.every((d) => d >= 750 && d <= 1250)).toBe(true);

    // Verify that jitter actually caused variation (not all the same)
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });
});
