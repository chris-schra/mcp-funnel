/**
 * Tests for ReconnectionManager - Max Attempts Handling
 */

import { describe, it, expect, vi } from 'vitest';
import { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { ConnectionState } from '@mcp-funnel/models';
import { setupTimers } from './test-utils.js';

describe('ReconnectionManager - Max Attempts Handling', () => {
  setupTimers();

  it('rejects when max attempts exceeded', async () => {
    const manager = new ReconnectionManager({
      maxAttempts: 2,
      initialDelayMs: 100,
      jitter: 0,
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);

    // First attempt: 100ms (100 * 2^0)
    const promise1 = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(100);
    await promise1;

    // Second attempt: 200ms (100 * 2^1)
    const promise2 = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(200);
    await promise2;

    // Third attempt should fail immediately (max attempts exceeded)
    await expect(manager.scheduleReconnect(connectFn)).rejects.toThrow(
      'Max reconnection attempts (2) exceeded',
    );
  });

  it('transitions to Failed state when max attempts exceeded', async () => {
    const manager = new ReconnectionManager({
      maxAttempts: 1,
      jitter: 0,
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);
    // First attempt uses initialDelay * 2^0 = 1000ms
    const promise = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(1000);
    await promise;

    try {
      await manager.scheduleReconnect(connectFn);
    } catch {
      // Expected
    }

    expect(manager.state).toBe(ConnectionState.Failed);
  });

  it('emits state change to Failed when max attempts exceeded', async () => {
    const manager = new ReconnectionManager({
      maxAttempts: 1,
      jitter: 0,
    });
    const stateChanges: ConnectionState[] = [];

    manager.onStateChange((event) => {
      stateChanges.push(event.to);
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);
    // First attempt uses initialDelay * 2^0 = 1000ms
    const promise = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(1000);
    await promise;

    try {
      await manager.scheduleReconnect(connectFn);
    } catch {
      // Expected
    }

    expect(stateChanges).toContain(ConnectionState.Failed);
  });
});
