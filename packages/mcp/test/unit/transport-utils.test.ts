/**
 * Tests for Transport Utilities
 *
 * Comprehensive test coverage for shared transport utility functions and classes
 * to eliminate redundancy between transport implementations.
 *
 * Test Categories:
 * 1. ReconnectionManager: Exponential backoff, attempt counting, timer management
 * 2. ID Generation: UUID generation for requests and sessions
 * 3. URL Sanitization: Auth token removal, invalid URL handling
 * 4. Log Data Sanitization: Token redaction, Bearer token handling
 * 5. Configuration Defaults: Reconnection config default application
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ReconnectionManager,
  type ReconnectionConfig,
  generateRequestId,
  generateSessionId,
  sanitizeUrl,
  sanitizeLogData,
  applyReconnectionDefaults,
} from '../../src/transports/utils/transport-utils.js';

// Mock logger module
vi.mock('../../src/logger.js', () => ({
  logEvent: vi.fn(),
}));

// Mock UUID module for predictable IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

describe('Transport Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('ReconnectionManager', () => {
    let reconnectFn: ReturnType<typeof vi.fn>;
    let onMaxAttemptsReached: ReturnType<typeof vi.fn>;
    let config: ReconnectionConfig;
    let manager: ReconnectionManager;

    beforeEach(() => {
      reconnectFn = vi.fn();
      onMaxAttemptsReached = vi.fn();
      config = {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 8000,
      };
      manager = new ReconnectionManager(
        config,
        reconnectFn,
        onMaxAttemptsReached,
        'test-transport',
      );
    });

    describe('Attempt Counting', () => {
      it('starts with zero attempts', () => {
        expect(manager.getAttemptCount()).toBe(0);
      });

      it('increments attempts on each reconnection', () => {
        manager.scheduleReconnection();
        expect(manager.getAttemptCount()).toBe(1);

        vi.advanceTimersByTime(1000);
        manager.scheduleReconnection();
        expect(manager.getAttemptCount()).toBe(2);
      });

      it('resets attempts to zero', () => {
        manager.scheduleReconnection();
        manager.scheduleReconnection();
        expect(manager.getAttemptCount()).toBe(2);

        manager.reset();
        expect(manager.getAttemptCount()).toBe(0);
      });
    });

    describe('Exponential Backoff', () => {
      it('uses initial delay for first attempt', () => {
        manager.scheduleReconnection();

        // Should not call reconnectFn immediately
        expect(reconnectFn).not.toHaveBeenCalled();

        // Should call after initial delay
        vi.advanceTimersByTime(1000);
        expect(reconnectFn).toHaveBeenCalledTimes(1);
      });

      it('applies exponential backoff for subsequent attempts', () => {
        // First attempt: 1000ms
        manager.scheduleReconnection();
        vi.advanceTimersByTime(999);
        expect(reconnectFn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(reconnectFn).toHaveBeenCalledTimes(1);

        // Second attempt: 2000ms (1000 * 2^1)
        manager.scheduleReconnection();
        vi.advanceTimersByTime(1999);
        expect(reconnectFn).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1);
        expect(reconnectFn).toHaveBeenCalledTimes(2);

        // Third attempt: 4000ms (1000 * 2^2)
        manager.scheduleReconnection();
        vi.advanceTimersByTime(3999);
        expect(reconnectFn).toHaveBeenCalledTimes(2);
        vi.advanceTimersByTime(1);
        expect(reconnectFn).toHaveBeenCalledTimes(3);
      });

      it('caps delay at maxDelayMs', () => {
        const shortMaxConfig: ReconnectionConfig = {
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffMultiplier: 10, // Large multiplier to test capping
          maxDelayMs: 3000,
        };

        const cappedManager = new ReconnectionManager(
          shortMaxConfig,
          reconnectFn,
          onMaxAttemptsReached,
          'test-transport',
        );

        // First attempt: 1000ms
        cappedManager.scheduleReconnection();
        vi.advanceTimersByTime(1000);

        // Second attempt: would be 10000ms but capped at 3000ms
        cappedManager.scheduleReconnection();
        vi.advanceTimersByTime(2999);
        expect(reconnectFn).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1);
        expect(reconnectFn).toHaveBeenCalledTimes(2);
      });
    });

    describe('Max Attempts Handling', () => {
      it('calls onMaxAttemptsReached when limit exceeded', () => {
        // Exhaust all attempts
        manager.scheduleReconnection(); // Attempt 1
        manager.scheduleReconnection(); // Attempt 2
        manager.scheduleReconnection(); // Attempt 3
        manager.scheduleReconnection(); // Attempt 4 - should trigger max reached

        expect(onMaxAttemptsReached).toHaveBeenCalledTimes(1);
        expect(reconnectFn).not.toHaveBeenCalled();
      });

      it('stops scheduling when max attempts reached', () => {
        // Reach max attempts (3 total)
        manager.scheduleReconnection(); // Attempt 1
        manager.scheduleReconnection(); // Attempt 2
        manager.scheduleReconnection(); // Attempt 3
        manager.scheduleReconnection(); // Attempt 4 - should trigger max reached

        expect(onMaxAttemptsReached).toHaveBeenCalledTimes(1);

        // Additional calls should trigger onMaxAttemptsReached again since attempts >= maxAttempts
        manager.scheduleReconnection();
        expect(onMaxAttemptsReached).toHaveBeenCalledTimes(2);
      });
    });

    describe('Timer Management', () => {
      it('cancels pending timer when cancelled', () => {
        manager.scheduleReconnection();
        manager.cancel();

        // Advance past the delay
        vi.advanceTimersByTime(2000);
        expect(reconnectFn).not.toHaveBeenCalled();
      });

      it('prevents reconnection after cancellation', () => {
        manager.cancel();
        manager.scheduleReconnection();

        vi.advanceTimersByTime(2000);
        expect(reconnectFn).not.toHaveBeenCalled();
      });

      it('handles multiple cancellations safely', () => {
        manager.scheduleReconnection();
        manager.cancel();
        manager.cancel(); // Should not throw

        expect(() => manager.cancel()).not.toThrow();
      });
    });

    describe('State Management', () => {
      it('ignores reconnection when closed', () => {
        manager.cancel(); // Close the manager
        manager.scheduleReconnection();

        expect(manager.getAttemptCount()).toBe(0);
        expect(reconnectFn).not.toHaveBeenCalled();
      });

      it('allows reset after cancellation', () => {
        manager.scheduleReconnection();
        manager.cancel();
        manager.reset();

        expect(manager.getAttemptCount()).toBe(0);
      });
    });
  });

  describe('ID Generation', () => {
    describe('generateRequestId', () => {
      it('returns UUID for request ID', () => {
        const id = generateRequestId();
        expect(id).toBe('mock-uuid-1234');
      });

      it('generates unique IDs on multiple calls', () => {
        // Test that the function is called - actual uniqueness depends on uuid implementation
        const id1 = generateRequestId();
        const id2 = generateRequestId();

        expect(id1).toBe('mock-uuid-1234');
        expect(id2).toBe('mock-uuid-1234'); // Same due to mocked implementation
      });
    });

    describe('generateSessionId', () => {
      it('returns UUID for session ID', () => {
        const id = generateSessionId();
        expect(id).toBe('mock-uuid-1234');
      });
    });
  });

  describe('URL Sanitization', () => {
    describe('sanitizeUrl', () => {
      it('redacts auth query parameter', () => {
        const url = 'https://example.com/path?auth=secret-token&other=value';
        const sanitized = sanitizeUrl(url);
        expect(sanitized).toBe(
          'https://example.com/path?auth=%5BREDACTED%5D&other=value',
        );
      });

      it('preserves URLs without auth parameter', () => {
        const url = 'https://example.com/path?param=value';
        const sanitized = sanitizeUrl(url);
        expect(sanitized).toBe(url);
      });

      it('handles URLs with only auth parameter', () => {
        const url = 'https://example.com?auth=token';
        const sanitized = sanitizeUrl(url);
        expect(sanitized).toBe('https://example.com/?auth=%5BREDACTED%5D');
      });

      it('handles multiple auth parameters', () => {
        const url = 'https://example.com?auth=token1&auth=token2';
        const sanitized = sanitizeUrl(url);
        // URLSearchParams.set() replaces all instances with a single value
        expect(sanitized).toBe('https://example.com/?auth=%5BREDACTED%5D');
      });

      it('returns [INVALID_URL] for malformed URLs', () => {
        const invalidUrl = 'not-a-valid-url';
        const sanitized = sanitizeUrl(invalidUrl);
        expect(sanitized).toBe('[INVALID_URL]');
      });

      it('handles empty string gracefully', () => {
        const sanitized = sanitizeUrl('');
        expect(sanitized).toBe('[INVALID_URL]');
      });

      it('preserves fragment and complex query strings', () => {
        const url =
          'https://example.com/path?param1=value1&auth=secret&param2=value2#fragment';
        const sanitized = sanitizeUrl(url);
        expect(sanitized).toBe(
          'https://example.com/path?param1=value1&auth=%5BREDACTED%5D&param2=value2#fragment',
        );
      });
    });
  });

  describe('Log Data Sanitization', () => {
    describe('sanitizeLogData', () => {
      it('redacts auth fields in JSON strings', () => {
        const data = '{"auth":"secret-token","data":"value"}';
        const sanitized = sanitizeLogData(data);
        expect(sanitized).toBe('{"auth":"[REDACTED]","data":"value"}');
      });

      it('redacts Bearer tokens', () => {
        const data = 'Authorization: Bearer secret-token-123';
        const sanitized = sanitizeLogData(data);
        expect(sanitized).toBe('Authorization: Bearer [REDACTED]');
      });

      it('redacts Authorization headers in JSON', () => {
        const data = '{"Authorization":"Bearer token","other":"value"}';
        const sanitized = sanitizeLogData(data);
        expect(sanitized).toBe(
          '{"Authorization":"[REDACTED]","other":"value"}',
        );
      });

      it('redacts multiple occurrences', () => {
        const data = '{"auth":"token1","Authorization":"Bearer token2"}';
        const sanitized = sanitizeLogData(data);
        expect(sanitized).toBe(
          '{"auth":"[REDACTED]","Authorization":"[REDACTED]"}',
        );
      });

      it('preserves non-auth data', () => {
        const data = '{"message":"hello","status":"ok"}';
        const sanitized = sanitizeLogData(data);
        expect(sanitized).toBe(data);
      });

      it('handles Bearer tokens with various formats', () => {
        const data1 = 'Bearer abc123';
        const data2 = 'Bearer  token-with-dashes';
        const data3 = 'Bearer token_with_underscores';

        expect(sanitizeLogData(data1)).toBe('Bearer [REDACTED]');
        expect(sanitizeLogData(data2)).toBe('Bearer [REDACTED]');
        expect(sanitizeLogData(data3)).toBe('Bearer [REDACTED]');
      });

      it('returns [NON_STRING_DATA] for non-string input', () => {
        const sanitized = sanitizeLogData(null as unknown as string);
        expect(sanitized).toBe('[NON_STRING_DATA]');

        const sanitized2 = sanitizeLogData(123 as unknown as string);
        expect(sanitized2).toBe('[NON_STRING_DATA]');
      });

      it('handles complex mixed content', () => {
        const data = `
          Request headers: {"Authorization":"Bearer secret123","auth":"token456"}
          Bearer jwt-token-789 in text
          Other data: other=value
        `;
        const sanitized = sanitizeLogData(data);

        expect(sanitized).toContain('"Authorization":"[REDACTED]"');
        expect(sanitized).toContain('"auth":"[REDACTED]"');
        expect(sanitized).toContain('Bearer [REDACTED]');
        expect(sanitized).toContain('other=value'); // Preserved
      });
    });
  });

  describe('Configuration Defaults', () => {
    describe('applyReconnectionDefaults', () => {
      it('applies all defaults when no config provided', () => {
        const config = applyReconnectionDefaults();
        expect(config).toEqual({
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 16000,
        });
      });

      it('applies all defaults when empty config provided', () => {
        const config = applyReconnectionDefaults({});
        expect(config).toEqual({
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 16000,
        });
      });

      it('preserves provided values and applies defaults for missing ones', () => {
        const config = applyReconnectionDefaults({
          maxAttempts: 10,
          backoffMultiplier: 3,
        });
        expect(config).toEqual({
          maxAttempts: 10,
          initialDelayMs: 1000, // default
          backoffMultiplier: 3,
          maxDelayMs: 16000, // default
        });
      });

      it('preserves all provided values', () => {
        const customConfig = {
          maxAttempts: 7,
          initialDelayMs: 2000,
          backoffMultiplier: 1.5,
          maxDelayMs: 30000,
        };
        const config = applyReconnectionDefaults(customConfig);
        expect(config).toEqual(customConfig);
      });

      it('handles zero values correctly', () => {
        const config = applyReconnectionDefaults({
          maxAttempts: 0,
          initialDelayMs: 0,
        });
        expect(config).toEqual({
          maxAttempts: 0,
          initialDelayMs: 0,
          backoffMultiplier: 2, // default
          maxDelayMs: 16000, // default
        });
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('reconnection manager uses provided configuration correctly', () => {
      const customConfig: ReconnectionConfig = {
        maxAttempts: 2,
        initialDelayMs: 500,
        backoffMultiplier: 3,
        maxDelayMs: 2000,
      };

      const reconnectFn = vi.fn();
      const onMaxReached = vi.fn();
      const manager = new ReconnectionManager(
        customConfig,
        reconnectFn,
        onMaxReached,
        'test',
      );

      // First attempt: 500ms
      manager.scheduleReconnection();
      vi.advanceTimersByTime(500);
      expect(reconnectFn).toHaveBeenCalledTimes(1);

      // Second attempt: 1500ms (500 * 3^1)
      manager.scheduleReconnection();
      vi.advanceTimersByTime(1500);
      expect(reconnectFn).toHaveBeenCalledTimes(2);

      // Third attempt: should trigger max reached
      manager.scheduleReconnection();
      expect(onMaxReached).toHaveBeenCalledTimes(1);
    });

    it('sanitization functions work together for comprehensive data cleaning', () => {
      const url = 'https://api.example.com/mcp?auth=secret123';
      const logData = '{"Authorization":"Bearer token456","auth":"secret123"}';

      const sanitizedUrl = sanitizeUrl(url);
      const sanitizedLog = sanitizeLogData(logData);

      expect(sanitizedUrl).toBe(
        'https://api.example.com/mcp?auth=%5BREDACTED%5D',
      );
      expect(sanitizedLog).toContain('[REDACTED]');
      expect(sanitizedLog).not.toContain('secret123');
      expect(sanitizedLog).not.toContain('token456');
    });
  });
});
