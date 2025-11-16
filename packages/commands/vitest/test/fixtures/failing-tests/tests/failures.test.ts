/**
 * Tests with intentional failures to verify error reporting
 * Mix of passed, failed, and skipped tests
 */
import { describe, it, expect } from 'vitest';

describe('Failing tests', () => {
  it('should pass - basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should fail - expected vs actual mismatch', () => {
    // This will fail with clear expected/actual values
    expect(5 + 3).toBe(10); // Expected: 10, Actual: 8
  });

  it('should fail - object comparison', () => {
    const actual = { name: 'John', age: 30 };
    const expected = { name: 'John', age: 25 };
    // This will fail with object diff
    expect(actual).toEqual(expected);
  });

  it.skip('should be skipped', () => {
    // This test is intentionally skipped
    expect(true).toBe(false);
  });

  it('should fail - array comparison', () => {
    const actual = [1, 2, 3, 4];
    const expected = [1, 2, 3, 5];
    // This will fail showing array diff
    expect(actual).toEqual(expected);
  });
});

describe('Error handling', () => {
  it('should fail - thrown error', () => {
    // This will fail by throwing an unexpected error
    throw new Error('Unexpected error occurred');
  });

  it('should fail - assertion error with message', () => {
    expect(10).toBeLessThan(5); // 10 is not less than 5
  });
});
