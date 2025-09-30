import { vi } from 'vitest';
import type { TokenData } from '@mcp-funnel/core';

// Mock timer functions for testing expiry and refresh scheduling
export const mockSetTimeout = vi.fn();
export const mockClearTimeout = vi.fn();

// Type definitions for testing
export interface MockTimerInfo {
  id: number;
  fn: () => void | Promise<void>;
  delay: number;
}

// Helper to create test token data
export function createTestToken(expiresInMs: number = 3600000): TokenData {
  return {
    accessToken:
      'test-access-token-' + Math.random().toString(36).substring(2, 11),
    expiresAt: new Date(Date.now() + expiresInMs),
    tokenType: 'Bearer',
    scope: 'read write',
  };
}

// Setup mock timers for tests
export function setupMockTimers(): {
  originalSetTimeout: typeof setTimeout;
  originalClearTimeout: typeof clearTimeout;
} {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  global.setTimeout = mockSetTimeout as unknown as typeof setTimeout;
  global.clearTimeout = mockClearTimeout as unknown as typeof clearTimeout;

  mockSetTimeout.mockImplementation(
    (fn: () => void | Promise<void>, delay: number): MockTimerInfo => {
      return { id: Math.random() * 1000, fn, delay };
    },
  );

  return { originalSetTimeout, originalClearTimeout };
}

// Restore original timers
export function restoreTimers(
  originalSetTimeout: typeof setTimeout,
  originalClearTimeout: typeof clearTimeout,
): void {
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
  vi.clearAllTimers();
}
