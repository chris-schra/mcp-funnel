import { describe, it, expect } from 'vitest';
import { parseStartSessionArgs } from '../parsers.js';

describe('parseStartSessionArgs', () => {
  describe('valid configurations', () => {
    it('should parse empty config with all optional fields undefined', () => {
      const result = parseStartSessionArgs({});

      expect(result).toEqual({
        tests: undefined,
        testPattern: undefined,
        timeout: undefined,
        maxTimeout: undefined,
        maxConsoleEntries: undefined,
        consoleLogTTL: undefined,
      });
    });

    it('should parse config with all fields provided', () => {
      const input = {
        tests: ['test1.ts', 'test2.ts'],
        testPattern: '**/*.spec.ts',
        timeout: 5000,
        maxTimeout: 10000,
        maxConsoleEntries: 500,
        consoleLogTTL: 60000,
      };

      const result = parseStartSessionArgs(input);

      expect(result).toEqual(input);
    });

    it('should parse config with only timeout', () => {
      const result = parseStartSessionArgs({ timeout: 3000 });

      expect(result).toEqual({
        tests: undefined,
        testPattern: undefined,
        timeout: 3000,
        maxTimeout: undefined,
        maxConsoleEntries: undefined,
        consoleLogTTL: undefined,
      });
    });

    it('should parse config with only tests array', () => {
      const result = parseStartSessionArgs({
        tests: ['src/test.ts'],
      });

      expect(result).toEqual({
        tests: ['src/test.ts'],
        testPattern: undefined,
        timeout: undefined,
        maxTimeout: undefined,
        maxConsoleEntries: undefined,
        consoleLogTTL: undefined,
      });
    });

    it('should parse config with only testPattern', () => {
      const result = parseStartSessionArgs({
        testPattern: '*.test.ts',
      });

      expect(result).toEqual({
        tests: undefined,
        testPattern: '*.test.ts',
        timeout: undefined,
        maxTimeout: undefined,
        maxConsoleEntries: undefined,
        consoleLogTTL: undefined,
      });
    });

    it('should handle empty tests array', () => {
      const result = parseStartSessionArgs({ tests: [] });

      expect(result.tests).toEqual([]);
    });
  });

  describe('type validation', () => {
    it('should reject non-array tests', () => {
      expect(() => {
        parseStartSessionArgs({ tests: 'not-an-array' });
      }).toThrow('tests must be an array');
    });

    it('should reject non-string test entries', () => {
      expect(() => {
        parseStartSessionArgs({ tests: ['valid.ts', 123, 'another.ts'] });
      }).toThrow('tests[1] must be a string');
    });

    it('should reject non-string testPattern', () => {
      expect(() => {
        parseStartSessionArgs({ testPattern: 123 });
      }).toThrow('testPattern must be a string');
    });

    it('should reject non-number timeout', () => {
      expect(() => {
        parseStartSessionArgs({ timeout: '5000' });
      }).toThrow('timeout must be a number');
    });

    it('should reject NaN timeout', () => {
      expect(() => {
        parseStartSessionArgs({ timeout: NaN });
      }).toThrow('timeout must be a number');
    });

    it('should reject non-number maxTimeout', () => {
      expect(() => {
        parseStartSessionArgs({ maxTimeout: '10000' });
      }).toThrow('maxTimeout must be a number');
    });

    it('should reject non-number maxConsoleEntries', () => {
      expect(() => {
        parseStartSessionArgs({ maxConsoleEntries: '500' });
      }).toThrow('maxConsoleEntries must be a number');
    });

    it('should reject non-number consoleLogTTL', () => {
      expect(() => {
        parseStartSessionArgs({ consoleLogTTL: true });
      }).toThrow('consoleLogTTL must be a number');
    });
  });

  describe('edge cases', () => {
    it('should ignore extra fields not part of config', () => {
      const result = parseStartSessionArgs({
        timeout: 1000,
        extraField: 'should be ignored',
        anotherExtra: 123,
      });

      expect(result).toEqual({
        tests: undefined,
        testPattern: undefined,
        timeout: 1000,
        maxTimeout: undefined,
        maxConsoleEntries: undefined,
        consoleLogTTL: undefined,
      });
    });

    it('should handle null values as invalid', () => {
      expect(() => {
        parseStartSessionArgs({ timeout: null });
      }).toThrow('timeout must be a number');
    });

    it('should accept zero as valid timeout', () => {
      const result = parseStartSessionArgs({ timeout: 0 });

      expect(result.timeout).toBe(0);
    });

    it('should accept negative numbers', () => {
      const result = parseStartSessionArgs({ timeout: -1000 });

      expect(result.timeout).toBe(-1000);
    });
  });
});
