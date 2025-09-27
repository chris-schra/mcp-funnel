/**
 * Tests for Transport Utilities
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

// Mock modules
vi.mock('../../src/logger.js', () => ({ logEvent: vi.fn() }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid-1234') }));

describe('Transport Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Test helpers
  const createTestManager = (config?: Partial<ReconnectionConfig>) => {
    const reconnectFn = vi.fn();
    const onMaxAttemptsReached = vi.fn();
    const fullConfig: ReconnectionConfig = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 8000,
      ...config,
    };
    const manager = new ReconnectionManager(
      fullConfig,
      reconnectFn,
      onMaxAttemptsReached,
      'test-transport',
    );
    return { manager, reconnectFn, onMaxAttemptsReached, config: fullConfig };
  };

  const testTimerAdvancement = (
    manager: ReconnectionManager,
    fn: ReturnType<typeof vi.fn>,
    delay: number,
    expectedCalls: number,
  ) => {
    vi.advanceTimersByTime(delay - 1);
    expect(fn).toHaveBeenCalledTimes(expectedCalls - 1);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(expectedCalls);
  };

  describe('ReconnectionManager', () => {
    it('manages attempt counting correctly', () => {
      const { manager } = createTestManager();

      expect(manager.getAttemptCount()).toBe(0);

      manager.scheduleReconnection();
      expect(manager.getAttemptCount()).toBe(1);

      vi.advanceTimersByTime(1000);
      manager.scheduleReconnection();
      expect(manager.getAttemptCount()).toBe(2);

      manager.reset();
      expect(manager.getAttemptCount()).toBe(0);
    });

    it('implements exponential backoff correctly', () => {
      const { manager, reconnectFn } = createTestManager();

      manager.scheduleReconnection();
      expect(reconnectFn).not.toHaveBeenCalled();
      testTimerAdvancement(manager, reconnectFn, 1000, 1);

      manager.scheduleReconnection();
      testTimerAdvancement(manager, reconnectFn, 2000, 2);

      manager.scheduleReconnection();
      testTimerAdvancement(manager, reconnectFn, 4000, 3);
    });

    it('caps delay at maxDelayMs', () => {
      const { manager, reconnectFn } = createTestManager({
        initialDelayMs: 1000,
        backoffMultiplier: 10,
        maxDelayMs: 3000,
      });

      manager.scheduleReconnection();
      vi.advanceTimersByTime(1000);
      expect(reconnectFn).toHaveBeenCalledTimes(1);

      manager.scheduleReconnection();
      testTimerAdvancement(manager, reconnectFn, 3000, 2);
    });

    it('handles max attempts correctly', () => {
      const { manager, reconnectFn, onMaxAttemptsReached } =
        createTestManager();

      manager.scheduleReconnection();
      manager.scheduleReconnection();
      manager.scheduleReconnection();
      manager.scheduleReconnection();

      expect(onMaxAttemptsReached).toHaveBeenCalledTimes(1);
      expect(reconnectFn).not.toHaveBeenCalled();

      manager.scheduleReconnection();
      expect(onMaxAttemptsReached).toHaveBeenCalledTimes(2);
    });

    it('handles cancellation and state management', () => {
      const { manager, reconnectFn } = createTestManager();

      manager.scheduleReconnection();
      manager.cancel();
      vi.advanceTimersByTime(2000);
      expect(reconnectFn).not.toHaveBeenCalled();

      manager.cancel();
      manager.scheduleReconnection();
      vi.advanceTimersByTime(2000);
      expect(reconnectFn).not.toHaveBeenCalled();

      expect(() => manager.cancel()).not.toThrow();

      manager.reset();
      expect(manager.getAttemptCount()).toBe(0);
    });
  });

  describe('ID Generation', () => {
    it('generates UUIDs for requests and sessions', () => {
      expect(generateRequestId()).toBe('mock-uuid-1234');
      expect(generateSessionId()).toBe('mock-uuid-1234');

      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).toBe('mock-uuid-1234');
      expect(id2).toBe('mock-uuid-1234');
    });
  });

  describe('URL Sanitization', () => {
    it('handles various URL scenarios', () => {
      expect(
        sanitizeUrl('https://example.com/path?auth=secret-token&other=value'),
      ).toBe('https://example.com/path?auth=%5BREDACTED%5D&other=value');
      expect(sanitizeUrl('https://example.com/path?param=value')).toBe(
        'https://example.com/path?param=value',
      );
      expect(sanitizeUrl('https://example.com?auth=token')).toBe(
        'https://example.com/?auth=%5BREDACTED%5D',
      );
      expect(sanitizeUrl('https://example.com?auth=token1&auth=token2')).toBe(
        'https://example.com/?auth=%5BREDACTED%5D',
      );
      expect(
        sanitizeUrl(
          'https://example.com/path?param1=value1&auth=secret&param2=value2#fragment',
        ),
      ).toBe(
        'https://example.com/path?param1=value1&auth=%5BREDACTED%5D&param2=value2#fragment',
      );
      expect(sanitizeUrl('not-a-valid-url')).toBe('[INVALID_URL]');
      expect(sanitizeUrl('')).toBe('[INVALID_URL]');
    });
  });

  describe('Log Data Sanitization', () => {
    it('handles various sanitization scenarios', () => {
      expect(sanitizeLogData('{"auth":"secret-token","data":"value"}')).toBe(
        '{"auth":"[REDACTED]","data":"value"}',
      );
      expect(sanitizeLogData('Authorization: Bearer secret-token-123')).toBe(
        'Authorization: Bearer [REDACTED]',
      );
      expect(
        sanitizeLogData('{"Authorization":"Bearer token","other":"value"}'),
      ).toBe('{"Authorization":"[REDACTED]","other":"value"}');
      expect(
        sanitizeLogData('{"auth":"token1","Authorization":"Bearer token2"}'),
      ).toBe('{"auth":"[REDACTED]","Authorization":"[REDACTED]"}');
      expect(sanitizeLogData('{"message":"hello","status":"ok"}')).toBe(
        '{"message":"hello","status":"ok"}',
      );

      [
        'Bearer abc123',
        'Bearer  token-with-dashes',
        'Bearer token_with_underscores',
      ].forEach((input) => {
        expect(sanitizeLogData(input)).toBe('Bearer [REDACTED]');
      });

      expect(sanitizeLogData(null as unknown as string)).toBe(
        '[NON_STRING_DATA]',
      );
      expect(sanitizeLogData(123 as unknown as string)).toBe(
        '[NON_STRING_DATA]',
      );

      const data = `Request headers: {"Authorization":"Bearer secret123","auth":"token456"}
        Bearer jwt-token-789 in text
        Other data: other=value`;
      const sanitized = sanitizeLogData(data);
      expect(sanitized).toContain('"Authorization":"[REDACTED]"');
      expect(sanitized).toContain('"auth":"[REDACTED]"');
      expect(sanitized).toContain('Bearer [REDACTED]');
      expect(sanitized).toContain('other=value');
    });
  });

  describe('Configuration Defaults', () => {
    it('applies defaults correctly', () => {
      const defaults = {
        maxAttempts: 5,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 16000,
      };

      expect(applyReconnectionDefaults()).toEqual(defaults);
      expect(applyReconnectionDefaults({})).toEqual(defaults);
      expect(
        applyReconnectionDefaults({ maxAttempts: 10, backoffMultiplier: 3 }),
      ).toEqual({ ...defaults, maxAttempts: 10, backoffMultiplier: 3 });

      const custom = {
        maxAttempts: 7,
        initialDelayMs: 2000,
        backoffMultiplier: 1.5,
        maxDelayMs: 30000,
      };
      expect(applyReconnectionDefaults(custom)).toEqual(custom);
      expect(
        applyReconnectionDefaults({ maxAttempts: 0, initialDelayMs: 0 }),
      ).toEqual({ ...defaults, maxAttempts: 0, initialDelayMs: 0 });
    });
  });

  describe('Integration Scenarios', () => {
    it('reconnection manager uses custom configuration correctly', () => {
      const { manager, reconnectFn, onMaxAttemptsReached } = createTestManager({
        maxAttempts: 2,
        initialDelayMs: 500,
        backoffMultiplier: 3,
        maxDelayMs: 2000,
      });

      manager.scheduleReconnection();
      vi.advanceTimersByTime(500);
      expect(reconnectFn).toHaveBeenCalledTimes(1);

      manager.scheduleReconnection();
      vi.advanceTimersByTime(1500);
      expect(reconnectFn).toHaveBeenCalledTimes(2);

      manager.scheduleReconnection();
      expect(onMaxAttemptsReached).toHaveBeenCalledTimes(1);
    });

    it('sanitization functions work together comprehensively', () => {
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
