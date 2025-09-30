/**
 * Tests for ReconnectionManager - Backward Compatibility
 */

import { describe, it, expect, vi } from 'vitest';
import { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { setupTimers } from './test-utils.js';

describe('ReconnectionManager - Backward Compatibility', () => {
  setupTimers();

  it('supports scheduleReconnection wrapper', async () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 100,
      jitter: 0,
    });
    const reconnectFn = vi.fn().mockResolvedValue(undefined);

    manager.scheduleReconnection(reconnectFn);

    vi.advanceTimersByTime(100);
    await vi.waitFor(() => {
      expect(reconnectFn).toHaveBeenCalledTimes(1);
    });
  });

  it('supports cancel alias', () => {
    const manager = new ReconnectionManager();
    const connectFn = vi.fn().mockResolvedValue(undefined);

    manager.scheduleReconnect(connectFn);
    manager.cancel(); // Alias for cancelReconnect

    vi.advanceTimersByTime(2000);
    expect(connectFn).not.toHaveBeenCalled();
  });

  it('handles synchronous reconnectFn in scheduleReconnection', async () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 100,
      jitter: 0,
    });
    let called = false;
    const reconnectFn = () => {
      called = true;
    };

    manager.scheduleReconnection(reconnectFn);

    vi.advanceTimersByTime(100);
    await vi.waitFor(() => {
      expect(called).toBe(true);
    });
  });
});
