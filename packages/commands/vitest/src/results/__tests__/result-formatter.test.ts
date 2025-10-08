import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TestModule } from 'vitest/node';
import type { TestError } from '@vitest/utils';
import { formatResults } from '../result-formatter.js';
import type { ConsoleStorage } from '../../console/console-storage.js';
import type { ParsedConsoleEntry } from '../../types/index.js';

// ============================================================================
// Mock Helpers
// ============================================================================

interface MockTestCase {
  id: string;
  name: string;
  fullName: string;
  result: () => {
    state: 'passed' | 'failed' | 'skipped' | 'pending';
    errors?: ReadonlyArray<TestError>;
  };
  diagnostic: () => { duration: number };
}

interface MockTestModule {
  moduleId: string;
  diagnostic: () => { duration: number };
  children: {
    allTests: () => Iterable<MockTestCase>;
  };
}

/**
 * Creates a mock test case for testing
 *
 * @param id - Test case identifier
 * @param name - Test case name
 * @param fullName - Full qualified test name
 * @param state - Test execution state
 * @param duration - Test duration in milliseconds
 * @param errors - Optional array of test errors
 * @returns Mock test case object
 */
function createMockTestCase(
  id: string,
  name: string,
  fullName: string,
  state: 'passed' | 'failed' | 'skipped' | 'pending',
  duration: number,
  errors?: ReadonlyArray<Partial<TestError>>,
): MockTestCase {
  return {
    id,
    name,
    fullName,
    result: () => ({ state, errors: errors as ReadonlyArray<TestError> | undefined }),
    diagnostic: () => ({ duration }),
  };
}

/**
 * Creates a mock test module for testing
 *
 * @param moduleId - Module file path
 * @param testCases - Array of test cases in module
 * @param duration - Module duration in milliseconds
 * @returns Mock test module object
 */
function createMockTestModule(
  moduleId: string,
  testCases: MockTestCase[],
  duration: number,
): MockTestModule {
  return {
    moduleId,
    diagnostic: () => ({ duration }),
    children: {
      allTests: function* () {
        yield* testCases;
      },
    },
  };
}

/**
 * Creates a mock console storage for testing
 *
 * @returns Mock console storage instance
 */
function createMockConsoleStorage(): ConsoleStorage {
  const mockQuery = vi.fn().mockReturnValue({ entries: [], totalMatches: 0 });
  const mockGetStats = vi.fn().mockReturnValue({
    total: 0,
    byStream: { stdout: 0, stderr: 0 },
  });

  return {
    query: mockQuery,
    getStats: mockGetStats,
  } as unknown as ConsoleStorage;
}

// ============================================================================
// Tests
// ============================================================================

describe('formatResults', () => {
  let _mockConsoleStorage: ConsoleStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    _mockConsoleStorage = createMockConsoleStorage();
  });

  describe('without filters (shows failed tests only)', () => {
    it('should only include failed tests when no filters are provided', () => {
      const testCases = [
        createMockTestCase('test-1', 'passes', 'Suite > passes', 'passed', 100),
        createMockTestCase('test-2', 'fails', 'Suite > fails', 'failed', 150, [
          { message: 'Test failed', stack: 'Error stack' },
        ]),
        createMockTestCase('test-3', 'another pass', 'Suite > another pass', 'passed', 120),
      ];

      const testModule = createMockTestModule('/project/src/test.spec.ts', testCases, 400);
      const result = formatResults([testModule as unknown as TestModule]);

      expect(result.total).toBe(3);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].tests).toHaveLength(1);
      expect(result.files[0].tests[0].status).toBe('failed');
    });

    it('should omit files with no failed tests when no filters provided', () => {
      const testCases = [
        createMockTestCase('test-1', 'pass1', 'Suite > pass1', 'passed', 100),
        createMockTestCase('test-2', 'pass2', 'Suite > pass2', 'passed', 100),
      ];

      const testModule = createMockTestModule('/project/src/passing.spec.ts', testCases, 250);
      const result = formatResults([testModule as unknown as TestModule]);

      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.files).toHaveLength(0);
    });

    it('should include error details for failed tests', () => {
      const testCases = [
        createMockTestCase(
          'test-fail',
          'should calculate sum',
          'Math > should calculate sum',
          'failed',
          100,
          [
            {
              message: 'Expected 5 but got 3',
              stack: 'Error stack',
              expected: '5',
              actual: '3',
              diff: '- 5\n+ 3',
            },
          ],
        ),
      ];

      const testModule = createMockTestModule('/project/src/math.spec.ts', testCases, 150);
      const result = formatResults([testModule as unknown as TestModule], {
        includeStackTraces: false,
      });

      expect(result.files[0].tests[0].error).toBeDefined();
      expect(result.files[0].tests[0].error?.message).toBe('Expected 5 but got 3');
      expect(result.files[0].tests[0].error?.expected).toBe('5');
      expect(result.files[0].tests[0].error?.actual).toBe('3');
      expect(result.files[0].tests[0].error?.stack).toBeUndefined();
    });
  });

  describe('with testFile filter (shows all test statuses)', () => {
    it('should show all test statuses when testFile filter is provided', () => {
      const testCases = [
        createMockTestCase('test-1', 'passes', 'Suite > passes', 'passed', 100),
        createMockTestCase('test-2', 'fails', 'Suite > fails', 'failed', 150, [
          { message: 'Failed' },
        ]),
        createMockTestCase('test-3', 'skipped', 'Suite > skipped', 'skipped', 0),
      ];

      const testModule = createMockTestModule('/project/src/test.spec.ts', testCases, 300);
      const result = formatResults([testModule as unknown as TestModule], {
        testFile: '**/*.spec.ts',
      });

      expect(result.files[0].tests).toHaveLength(3);
      expect(result.files[0].tests.map((t) => t.status)).toEqual(['passed', 'failed', 'skipped']);
    });

    it('should filter files by testFile glob pattern', () => {
      const testCases = [createMockTestCase('test-1', 'test1', 'test1', 'passed', 100)];

      const module1 = createMockTestModule('/project/src/auth.spec.ts', testCases, 150);
      const module2 = createMockTestModule('/project/src/utils.test.ts', testCases, 150);

      const result = formatResults([module1, module2] as unknown as TestModule[], {
        testFile: '**/*.spec.ts',
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].file).toBe('/project/src/auth.spec.ts');
    });

    it('should include duration of filtered out files in total', () => {
      const testCases = [createMockTestCase('test-1', 'test1', 'test1', 'passed', 100)];

      const module1 = createMockTestModule('/project/src/matching.spec.ts', testCases, 200);
      const module2 = createMockTestModule('/project/src/excluded.test.ts', testCases, 300);

      const result = formatResults([module1, module2] as unknown as TestModule[], {
        testFile: '**/*.spec.ts',
      });

      expect(result.duration).toBe(500);
    });
  });

  describe('with testName filter (shows all test statuses)', () => {
    it('should show all test statuses when testName filter is provided', () => {
      const testCases = [
        createMockTestCase(
          'test-1',
          'should handle login',
          'Auth > should handle login',
          'passed',
          100,
        ),
        createMockTestCase('test-2', 'validates input', 'Auth > validates input', 'skipped', 0),
      ];

      const testModule = createMockTestModule('/project/src/auth.spec.ts', testCases, 250);
      const result = formatResults([testModule as unknown as TestModule], {
        testName: '*should handle*',
      });

      expect(result.files[0].tests).toHaveLength(1);
      expect(result.files[0].tests[0].name).toBe('should handle login');
    });

    it('should combine testFile and testName filters', () => {
      const module1TestCases = [
        createMockTestCase('test-1', 'should work', 'Suite > should work', 'passed', 100),
        createMockTestCase('test-2', 'must fail', 'Suite > must fail', 'failed', 100, [
          { message: 'Failed' },
        ]),
      ];

      const module1 = createMockTestModule('/project/src/auth.spec.ts', module1TestCases, 250);

      const result = formatResults([module1] as unknown as TestModule[], {
        testFile: '**/*.spec.ts',
        testName: '*should*',
      });

      expect(result.files[0].tests).toHaveLength(1);
      expect(result.files[0].tests[0].name).toBe('should work');
    });
  });

  describe('console count integration', () => {
    it('should track console counts and handle storage gracefully', () => {
      const testCases = [
        createMockTestCase('test-1', 'logs data', 'Suite > logs data', 'failed', 100, [
          { message: 'Failed' },
        ]),
      ];
      const testModule = createMockTestModule('/project/src/test.spec.ts', testCases, 150);

      // Test with console storage
      const mockStorage = createMockConsoleStorage();
      (mockStorage.query as ReturnType<typeof vi.fn>).mockImplementation(
        (_sessionId: string, query: { taskId?: string; testFile?: string }) => {
          if (query.taskId === 'test-1') {
            return {
              entries: Array.from({ length: 3 }, (_, i) => ({ id: i + 1 })) as ParsedConsoleEntry[],
              totalMatches: 3,
            };
          }
          if (query.testFile) {
            return {
              entries: Array.from({ length: 4 }, (_, i) => ({ id: i + 1 })) as ParsedConsoleEntry[],
              totalMatches: 4,
            };
          }
          return { entries: [], totalMatches: 0 };
        },
      );

      const withStorage = formatResults(
        [testModule as unknown as TestModule],
        { sessionId: 'session-123' },
        mockStorage,
      );
      expect(withStorage.files[0].tests[0].consoleCount).toBe(3);
      expect(withStorage.files[0].consoleCount).toBe(4);

      // Test without console storage
      const withoutStorage = formatResults([testModule as unknown as TestModule], {
        sessionId: 'session-123',
      });
      expect(withoutStorage.console.total).toBe(0);
      expect(withoutStorage.files[0].tests[0].consoleCount).toBe(0);
    });
  });

  describe('error extraction', () => {
    it('should include stack traces when includeStackTraces is true', () => {
      const testCases = [
        createMockTestCase('test-1', 'fails', 'Suite > fails', 'failed', 100, [
          {
            message: 'Test failed',
            stack: 'Error: Test failed\n    at /project/test.ts:10:5',
          },
        ]),
      ];

      const testModule = createMockTestModule('/project/src/test.spec.ts', testCases, 150);
      const result = formatResults([testModule as unknown as TestModule], {
        includeStackTraces: true,
      });

      expect(result.files[0].tests[0].error?.stack).toBe(
        'Error: Test failed\n    at /project/test.ts:10:5',
      );
    });

    it('should handle failed tests with no error details', () => {
      const testCases = [createMockTestCase('test-1', 'fails', 'Suite > fails', 'failed', 100, [])];

      const testModule = createMockTestModule('/project/src/test.spec.ts', testCases, 150);
      const result = formatResults([testModule as unknown as TestModule]);

      expect(result.files[0].tests[0].error?.message).toBe('Unknown error');
    });
  });

  describe('edge cases', () => {
    it('should handle empty modules, skipped tests, and filtering', () => {
      expect(formatResults([]).files).toHaveLength(0);

      const emptyModule = createMockTestModule('/project/src/empty.spec.ts', [], 50);
      expect(formatResults([emptyModule as unknown as TestModule]).total).toBe(0);

      const skippedCases = [
        createMockTestCase('test-1', 'skip1', 'Suite > skip1', 'skipped', 0),
        createMockTestCase('test-2', 'skip2', 'Suite > skip2', 'skipped', 0),
      ];
      const skippedModule = createMockTestModule('/project/src/skipped.spec.ts', skippedCases, 10);

      const withoutFilter = formatResults([skippedModule as unknown as TestModule]);
      expect(withoutFilter.skipped).toBe(2);
      expect(withoutFilter.files).toHaveLength(0);

      const withFilter = formatResults([skippedModule as unknown as TestModule], {
        testFile: '**/*',
      });
      expect(withFilter.files[0].tests[0].status).toBe('skipped');
    });
  });

  describe('glob pattern matching', () => {
    it('should match files with wildcard patterns', () => {
      const testCases = [createMockTestCase('test-1', 'test', 'test', 'passed', 100)];

      const module1 = createMockTestModule('/project/src/auth/login.spec.ts', testCases, 150);
      const module2 = createMockTestModule('/project/src/utils/helpers.test.ts', testCases, 150);

      const result = formatResults([module1, module2] as unknown as TestModule[], {
        testFile: '**/auth/**',
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].file).toBe('/project/src/auth/login.spec.ts');
    });
  });
});
