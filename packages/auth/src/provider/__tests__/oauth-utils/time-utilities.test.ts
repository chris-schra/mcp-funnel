/**
 * Tests for OAuth time utility functions
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../../utils/index.js';

const { getCurrentTimestamp, isExpired } = OAuthUtils;

describe('Time Utilities', () => {
  it('should get current timestamp', () => {
    const timestamp = getCurrentTimestamp();
    expect(typeof timestamp).toBe('number');
    expect(timestamp).toBeGreaterThan(0);

    // Should be approximately current time (within 1 second)
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs(timestamp - now)).toBeLessThanOrEqual(1);
  });

  it('should detect expired timestamps', () => {
    const expiredTime = getCurrentTimestamp() - 100; // 100 seconds ago
    const futureTime = getCurrentTimestamp() + 100; // 100 seconds from now

    expect(isExpired(expiredTime)).toBe(true);
    expect(isExpired(futureTime)).toBe(false);
  });
});
