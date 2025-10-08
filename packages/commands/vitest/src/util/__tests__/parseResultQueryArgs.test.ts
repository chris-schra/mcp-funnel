import { describe, it, expect } from 'vitest';
import { parseResultQueryArgs } from '../parsers.js';

describe('parseResultQueryArgs', () => {
  describe('valid configurations', () => {
    it('should parse minimal config with only sessionId', () => {
      const result = parseResultQueryArgs({
        sessionId: 'session-123',
      });

      expect(result).toEqual({
        sessionId: 'session-123',
        includeStackTraces: undefined,
        testFile: undefined,
        testName: undefined,
      });
    });

    it('should parse config with all fields', () => {
      const result = parseResultQueryArgs({
        sessionId: 'session-456',
        includeStackTraces: true,
        testFile: 'src/utils.test.ts',
        testName: 'should work correctly',
      });

      expect(result).toEqual({
        sessionId: 'session-456',
        includeStackTraces: true,
        testFile: 'src/utils.test.ts',
        testName: 'should work correctly',
      });
    });

    it('should parse config with includeStackTraces false', () => {
      const result = parseResultQueryArgs({
        sessionId: 'session-789',
        includeStackTraces: false,
      });

      expect(result.includeStackTraces).toBe(false);
    });

    it('should parse config with only testFile filter', () => {
      const result = parseResultQueryArgs({
        sessionId: 'sess-1',
        testFile: 'parsers.test.ts',
      });

      expect(result).toEqual({
        sessionId: 'sess-1',
        includeStackTraces: undefined,
        testFile: 'parsers.test.ts',
        testName: undefined,
      });
    });

    it('should parse config with only testName filter', () => {
      const result = parseResultQueryArgs({
        sessionId: 'sess-2',
        testName: 'edge case',
      });

      expect(result).toEqual({
        sessionId: 'sess-2',
        includeStackTraces: undefined,
        testFile: undefined,
        testName: 'edge case',
      });
    });
  });

  describe('sessionId validation', () => {
    it('should reject missing sessionId', () => {
      expect(() => {
        parseResultQueryArgs({});
      }).toThrow('sessionId must be a non-empty string');
    });

    it('should reject empty string sessionId', () => {
      expect(() => {
        parseResultQueryArgs({ sessionId: '' });
      }).toThrow('sessionId must be a non-empty string');
    });

    it('should reject non-string sessionId', () => {
      expect(() => {
        parseResultQueryArgs({ sessionId: 123 });
      }).toThrow('sessionId must be a non-empty string');
    });

    it('should reject undefined sessionId', () => {
      expect(() => {
        parseResultQueryArgs({ sessionId: undefined });
      }).toThrow('sessionId must be a non-empty string');
    });

    it('should reject null sessionId', () => {
      expect(() => {
        parseResultQueryArgs({ sessionId: null });
      }).toThrow('sessionId must be a non-empty string');
    });
  });

  describe('type validation', () => {
    it('should reject non-boolean includeStackTraces', () => {
      expect(() => {
        parseResultQueryArgs({
          sessionId: 'valid-id',
          includeStackTraces: 'true',
        });
      }).toThrow('includeStackTraces must be a boolean');
    });

    it('should reject non-string testFile', () => {
      expect(() => {
        parseResultQueryArgs({
          sessionId: 'valid-id',
          testFile: 123,
        });
      }).toThrow('testFile must be a string');
    });

    it('should reject non-string testName', () => {
      expect(() => {
        parseResultQueryArgs({
          sessionId: 'valid-id',
          testName: ['test1', 'test2'],
        });
      }).toThrow('testName must be a string');
    });
  });

  describe('edge cases', () => {
    it('should ignore extra fields', () => {
      const result = parseResultQueryArgs({
        sessionId: 'sess-x',
        extraField: 'ignored',
      });

      expect(result).toEqual({
        sessionId: 'sess-x',
        includeStackTraces: undefined,
        testFile: undefined,
        testName: undefined,
      });
    });

    it('should allow empty string for testFile', () => {
      const result = parseResultQueryArgs({
        sessionId: 'sess-y',
        testFile: '',
      });

      expect(result.testFile).toBe('');
    });

    it('should allow empty string for testName', () => {
      const result = parseResultQueryArgs({
        sessionId: 'sess-z',
        testName: '',
      });

      expect(result.testName).toBe('');
    });
  });
});
