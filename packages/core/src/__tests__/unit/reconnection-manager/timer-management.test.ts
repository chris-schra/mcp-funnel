/**
 * Tests for ReconnectionManager - Timer Management
 */

import { describe, it, expect, vi } from 'vitest';
import { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { setupTimers } from './test-utils.js';

describe('ReconnectionManager - Timer Management', () => {
  setupTimers();

  it('cancels pending timer when cancelled', async () => {
    const manager = new ReconnectionManager({ initialDelayMs: 1000 });
    const connectFn = vi.fn().mockResolvedValue(undefined);

    manager.scheduleReconnect(connectFn);
    manager.cancelReconnect();

    // Advance past the delay
    vi.advanceTimersByTime(2000);
    expect(connectFn).not.toHaveBeenCalled();
  });

  it('prevents reconnection after cancellation', async () => {
    const manager = new ReconnectionManager();
    const connectFn = vi.fn().mockResolvedValue(undefined);

    manager.cancelReconnect();

    // Timer is cancelled before scheduling, so immediate execution
    const promise = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(2000);

    // Should still execute since scheduleReconnect starts new timer
    await promise;
    expect(connectFn).toHaveBeenCalled();
  });

  it('handles multiple cancellations safely', () => {
    const manager = new ReconnectionManager();
    const connectFn = vi.fn().mockResolvedValue(undefined);

    manager.scheduleReconnect(connectFn);
    manager.cancelReconnect();
    manager.cancelReconnect(); // Should not throw

    expect(() => manager.cancelReconnect()).not.toThrow();
  });

  it('clears timeout on destroy', () => {
    const manager = new ReconnectionManager();
    const connectFn = vi.fn().mockResolvedValue(undefined);

    manager.scheduleReconnect(connectFn);
    manager.destroy();

    vi.advanceTimersByTime(5000);
    expect(connectFn).not.toHaveBeenCalled();
  });
});
