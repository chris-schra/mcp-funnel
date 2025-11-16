import { describe, it, expect } from 'vitest';
import { hasFilters } from '../parsers.js';

describe('hasFilters', () => {
  it('should return false when no filters are applied', () => {
    const result = hasFilters({
      sessionId: 'sess-1',
      includeStackTraces: true,
    });

    expect(result).toBe(false);
  });

  it('should return true when testFile filter is defined', () => {
    const result = hasFilters({
      sessionId: 'sess-1',
      testFile: 'utils.test.ts',
    });

    expect(result).toBe(true);
  });

  it('should return true when testName filter is defined', () => {
    const result = hasFilters({
      sessionId: 'sess-1',
      testName: 'should work',
    });

    expect(result).toBe(true);
  });

  it('should return true when both filters are defined', () => {
    const result = hasFilters({
      sessionId: 'sess-1',
      testFile: 'utils.test.ts',
      testName: 'should work',
    });

    expect(result).toBe(true);
  });

  it('should return true for empty strings (defined values are filters)', () => {
    const result = hasFilters({
      sessionId: 'sess-1',
      testFile: '',
      testName: '',
    });

    // Empty strings are defined (not undefined), so they are considered filters
    expect(result).toBe(true);
  });

  it('should ignore includeStackTraces as it is not a content filter', () => {
    const result = hasFilters({
      sessionId: 'sess-1',
      includeStackTraces: true,
    });

    expect(result).toBe(false);
  });

  it('should return true even if only testFile is empty string', () => {
    const result = hasFilters({
      sessionId: 'sess-1',
      testFile: '',
      testName: 'test',
    });

    expect(result).toBe(true);
  });

  it('should return true even if only testName is empty string', () => {
    const result = hasFilters({
      sessionId: 'sess-1',
      testFile: 'file.ts',
      testName: '',
    });

    expect(result).toBe(true);
  });
});
