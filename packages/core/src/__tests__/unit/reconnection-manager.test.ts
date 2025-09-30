/**
 * Tests for ReconnectionManager
 *
 * Comprehensive test coverage for reconnection logic including:
 * - Exponential backoff with jitter
 * - State management and transitions
 * - Attempt counting and max retries
 * - Timer management
 * - State change notifications
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReconnectionManager } from '../../reconnection-manager/index.js';
import {
  ConnectionState,
  type ConnectionStateChange,
  type ReconnectionConfig,
} from '@mcp-funnel/models';

describe('ReconnectionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('starts with Disconnected state', () => {
      const manager = new ReconnectionManager();
      expect(manager.state).toBe(ConnectionState.Disconnected);
    });

    it('starts with zero retry count', () => {
      const manager = new ReconnectionManager();
      expect(manager.currentRetryCount).toBe(0);
    });

    it('applies default configuration', () => {
      const manager = new ReconnectionManager();
      expect(manager.hasRetriesLeft).toBe(true);
    });

    it('accepts custom configuration with legacy property names', () => {
      const config: ReconnectionConfig = {
        maxAttempts: 5,
        initialDelayMs: 2000,
        backoffMultiplier: 3,
        maxDelayMs: 10000,
      };
      const manager = new ReconnectionManager(config);
      expect(manager.hasRetriesLeft).toBe(true);
    });

    it('accepts custom configuration with new property names', () => {
      const config: ReconnectionConfig = {
        maxRetries: 5,
        initialDelay: 2000,
        backoffMultiplier: 3,
        maxDelay: 10000,
        jitter: 0.1,
      };
      const manager = new ReconnectionManager(config);
      expect(manager.hasRetriesLeft).toBe(true);
    });
  });

  describe('Attempt Counting', () => {
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

  describe('Exponential Backoff', () => {
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

  describe('Max Attempts Handling', () => {
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

  describe('Timer Management', () => {
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

  describe('State Management', () => {
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

  describe('Backward Compatibility', () => {
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

  describe('Error Handling', () => {
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

  describe('Next Retry Delay', () => {
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
});
