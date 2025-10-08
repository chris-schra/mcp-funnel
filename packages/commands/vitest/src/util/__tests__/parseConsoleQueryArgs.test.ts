import { describe, it, expect } from 'vitest';
import { parseConsoleQueryArgs } from '../parsers.js';

describe('parseConsoleQueryArgs', () => {
  describe('valid configurations', () => {
    it('should parse minimal config with only sessionId', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'console-sess-1',
      });

      expect(result).toEqual({
        sessionId: 'console-sess-1',
        streamType: undefined,
        taskId: undefined,
        testFile: undefined,
        testName: undefined,
        search: undefined,
        useRegex: undefined,
        caseSensitive: undefined,
        limit: undefined,
        skip: undefined,
        after: undefined,
        before: undefined,
      });
    });

    it('should parse config with all fields', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'console-sess-2',
        streamType: 'stdout',
        taskId: 'task-123',
        testFile: 'parsers.test.ts',
        testName: 'should parse',
        search: 'error',
        useRegex: true,
        caseSensitive: false,
        limit: 50,
        skip: 10,
        after: 1234567890,
        before: 1234567900,
      });

      expect(result).toEqual({
        sessionId: 'console-sess-2',
        streamType: 'stdout',
        taskId: 'task-123',
        testFile: 'parsers.test.ts',
        testName: 'should parse',
        search: 'error',
        useRegex: true,
        caseSensitive: false,
        limit: 50,
        skip: 10,
        after: 1234567890,
        before: 1234567900,
      });
    });

    it('should parse config with streamType stderr', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        streamType: 'stderr',
      });

      expect(result.streamType).toBe('stderr');
    });

    it('should parse config with streamType both', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        streamType: 'both',
      });

      expect(result.streamType).toBe('both');
    });

    it('should parse config with pagination options', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        limit: 100,
        skip: 20,
      });

      expect(result.limit).toBe(100);
      expect(result.skip).toBe(20);
    });

    it('should parse config with time range', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        after: 1000000,
        before: 2000000,
      });

      expect(result.after).toBe(1000000);
      expect(result.before).toBe(2000000);
    });

    it('should parse config with search options', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        search: 'pattern',
        useRegex: true,
        caseSensitive: true,
      });

      expect(result.search).toBe('pattern');
      expect(result.useRegex).toBe(true);
      expect(result.caseSensitive).toBe(true);
    });

    it('should parse config with test filters', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        taskId: 'task-xyz',
        testFile: 'file.test.ts',
        testName: 'test case',
      });

      expect(result.taskId).toBe('task-xyz');
      expect(result.testFile).toBe('file.test.ts');
      expect(result.testName).toBe('test case');
    });
  });

  describe('sessionId validation', () => {
    it('should reject missing sessionId', () => {
      expect(() => {
        parseConsoleQueryArgs({});
      }).toThrow('sessionId must be a non-empty string');
    });

    it('should reject empty string sessionId', () => {
      expect(() => {
        parseConsoleQueryArgs({ sessionId: '' });
      }).toThrow('sessionId must be a non-empty string');
    });

    it('should reject non-string sessionId', () => {
      expect(() => {
        parseConsoleQueryArgs({ sessionId: 456 });
      }).toThrow('sessionId must be a non-empty string');
    });
  });

  describe('streamType validation', () => {
    it('should reject invalid streamType', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          streamType: 'invalid',
        });
      }).toThrow('streamType must be one of: stdout, stderr, both (got: invalid)');
    });

    it('should reject numeric streamType', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          streamType: 123,
        });
      }).toThrow('streamType must be a string');
    });

    it('should reject boolean streamType', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          streamType: true,
        });
      }).toThrow('streamType must be a string');
    });
  });

  describe('type validation', () => {
    it('should reject non-string taskId', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          taskId: 123,
        });
      }).toThrow('taskId must be a string');
    });

    it('should reject non-string testFile', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          testFile: ['file.ts'],
        });
      }).toThrow('testFile must be a string');
    });

    it('should reject non-string testName', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          testName: 123,
        });
      }).toThrow('testName must be a string');
    });

    it('should reject non-string search', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          search: /regex/,
        });
      }).toThrow('search must be a string');
    });

    it('should reject non-boolean useRegex', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          useRegex: 'true',
        });
      }).toThrow('useRegex must be a boolean');
    });

    it('should reject non-boolean caseSensitive', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          caseSensitive: 1,
        });
      }).toThrow('caseSensitive must be a boolean');
    });

    it('should reject non-number limit', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          limit: '50',
        });
      }).toThrow('limit must be a number');
    });

    it('should reject non-number skip', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          skip: '10',
        });
      }).toThrow('skip must be a number');
    });

    it('should reject non-number after', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          after: '1000',
        });
      }).toThrow('after must be a number');
    });

    it('should reject non-number before', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          before: '2000',
        });
      }).toThrow('before must be a number');
    });

    it('should reject NaN for numeric fields', () => {
      expect(() => {
        parseConsoleQueryArgs({
          sessionId: 'sess',
          limit: NaN,
        });
      }).toThrow('limit must be a number');
    });
  });

  describe('edge cases', () => {
    it('should ignore extra fields', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        extraField: 'ignored',
        anotherExtra: 123,
      });

      expect(result).toEqual({
        sessionId: 'sess',
        streamType: undefined,
        taskId: undefined,
        testFile: undefined,
        testName: undefined,
        search: undefined,
        useRegex: undefined,
        caseSensitive: undefined,
        limit: undefined,
        skip: undefined,
        after: undefined,
        before: undefined,
      });
    });

    it('should allow empty strings for optional string fields', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        taskId: '',
        testFile: '',
        testName: '',
        search: '',
      });

      expect(result.taskId).toBe('');
      expect(result.testFile).toBe('');
      expect(result.testName).toBe('');
      expect(result.search).toBe('');
    });

    it('should accept zero for numeric fields', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        limit: 0,
        skip: 0,
        after: 0,
        before: 0,
      });

      expect(result.limit).toBe(0);
      expect(result.skip).toBe(0);
      expect(result.after).toBe(0);
      expect(result.before).toBe(0);
    });

    it('should accept negative numbers for numeric fields', () => {
      const result = parseConsoleQueryArgs({
        sessionId: 'sess',
        limit: -1,
        skip: -10,
      });

      expect(result.limit).toBe(-1);
      expect(result.skip).toBe(-10);
    });
  });
});
