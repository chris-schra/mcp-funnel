/**
 * Tests for ReconnectionManager - State Management
 */

import { describe, it, expect, vi } from 'vitest';
import { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { ConnectionState } from '@mcp-funnel/models';
import { setupTimers } from './test-utils.js';

describe('ReconnectionManager - State Management', () => {
  setupTimers();

  it('transitions through states correctly', async () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 100,
      jitter: 0,
    });
    const states: ConnectionState[] = [];

    manager.onStateChange((event) => {
      states.push(event.to);
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);

    // Start connecting
    manager.onConnecting();
    expect(states).toContain(ConnectionState.Connecting);

    // Connection succeeds
    manager.onConnected();
    expect(states).toContain(ConnectionState.Connected);

    // Connection lost
    manager.onDisconnected();
    expect(states).toContain(ConnectionState.Disconnected);

    // Schedule reconnect
    const promise = manager.scheduleReconnect(connectFn);
    expect(states).toContain(ConnectionState.Reconnecting);

    vi.advanceTimersByTime(100);
    await promise;
  });

  it('includes retry count in state change events', async () => {
    const manager = new ReconnectionManager({
      initialDelayMs: 100,
      jitter: 0,
    });
    let lastRetryCount = 0;

    manager.onStateChange((event) => {
      lastRetryCount = event.retryCount;
    });

    const connectFn = vi.fn().mockResolvedValue(undefined);

    // First attempt: 100ms (100 * 2^0)
    const promise1 = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(100);
    await promise1;
    expect(lastRetryCount).toBe(1);

    // Second attempt: 200ms (100 * 2^1)
    const promise2 = manager.scheduleReconnect(connectFn);
    vi.advanceTimersByTime(200);
    await promise2;
    expect(lastRetryCount).toBe(2);
  });

  it('includes error in disconnection events', () => {
    const manager = new ReconnectionManager();
    let capturedError: Error | undefined;

    manager.onStateChange((event) => {
      capturedError = event.error;
    });

    const error = new Error('Connection lost');
    manager.onDisconnected(error);

    expect(capturedError).toBe(error);
  });

  it('allows reset after cancellation', () => {
    const manager = new ReconnectionManager();
    const connectFn = vi.fn().mockResolvedValue(undefined);

    manager.scheduleReconnect(connectFn);
    manager.cancelReconnect();
    manager.reset();

    expect(manager.getAttemptCount()).toBe(0);
    expect(manager.state).toBe(ConnectionState.Disconnected);
  });

  it('does not transition to Disconnected when already Failed', async () => {
    const manager = new ReconnectionManager({ maxAttempts: 1 });

    const connectFn = vi.fn().mockResolvedValue(undefined);

    // Exhaust retries
    manager.scheduleReconnect(connectFn).then();
    vi.advanceTimersByTime(1000);

    await expect(manager.scheduleReconnect(connectFn)).rejects.toThrow(
      'Max reconnection attempts (1) exceeded',
    );

    expect(manager.state).toBe(ConnectionState.Failed);

    // Try to disconnect again
    manager.onDisconnected();

    // Should still be Failed, not Disconnected
    expect(manager.state).toBe(ConnectionState.Failed);
  });

  it('allows removing state change handlers', () => {
    const manager = new ReconnectionManager();
    const handler = vi.fn();

    manager.onStateChange(handler);
    manager.onConnecting();
    expect(handler).toHaveBeenCalledTimes(1);

    manager.removeStateChangeHandler(handler);
    manager.onConnected();
    expect(handler).toHaveBeenCalledTimes(1); // Not called again
  });

  it('clears all handlers on destroy', () => {
    const manager = new ReconnectionManager();
    const handler = vi.fn();

    manager.onStateChange(handler);
    manager.destroy();
    manager.onConnecting();

    expect(handler).not.toHaveBeenCalled();
  });
});
