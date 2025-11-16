/**
 * Tests for ReconnectionManager - Next Retry Delay
 */

import { describe, it, expect, vi } from 'vitest';
import { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { ConnectionState, type ConnectionStateChange } from '@mcp-funnel/models';
import { setupTimers } from './test-utils.js';

describe('ReconnectionManager - Next Retry Delay', () => {
  setupTimers();

  it('includes nextRetryDelay in state change when reconnecting', () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 1000,
      maxAttempts: 5,
      jitter: 0,
    });

    let nextDelay: number | undefined;
    manager.onStateChange((event) => {
      nextDelay = event.nextRetryDelay;
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);
    manager.scheduleReconnect(connectFn);

    expect(nextDelay).toBeDefined();
    expect(nextDelay).toBeGreaterThan(0);
  });

  it('does not include nextRetryDelay when no retries left', async () => {
    const manager = new ReconnectionManager({
      maxAttempts: 1,
      initialDelayMs: 100,
      jitter: 0,
    });

    let lastEvent: ConnectionStateChange | undefined;
    manager.onStateChange((event) => {
      lastEvent = event;
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);
    // First attempt uses retryCount=0, delay = 100 * 2^0 = 100ms
    const promise = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(100);
    await promise;

    try {
      await manager.scheduleReconnect(connectFn);
    } catch {
      // Expected
    }

    // Failed state should not have nextRetryDelay
    expect(lastEvent).toBeDefined();
    expect(lastEvent?.to).toBe(ConnectionState.Failed);
    expect(lastEvent?.nextRetryDelay).toBeUndefined();
  });
});
