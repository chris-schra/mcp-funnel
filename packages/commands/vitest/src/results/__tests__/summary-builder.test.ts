import { describe, it, expect } from 'vitest';
import { buildSummary } from '../summary-builder.js';
import type { TestError } from '@vitest/utils';
import { createMockTestModule, createTestError } from './summary-builder-test-utils.js';

describe('buildSummary', () => {
  describe('basic counting', () => {
    it('should count tests by state across multiple modules', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [
          { name: 'test 1', state: 'passed' },
          { name: 'test 2', state: 'passed' },
          { name: 'test 3', state: 'skipped' },
        ]),
        createMockTestModule('/path/to/file2.test.ts', [
          { name: 'test 4', state: 'failed', errors: [createTestError('fail')] },
          { name: 'test 5', state: 'skipped' },
          { name: 'test 6', state: 'passed' },
        ]),
      ];

      const summary = buildSummary(modules);

      expect(summary.total).toBe(6);
      expect(summary.passed).toBe(3);
      expect(summary.skipped).toBe(2);
    });
  });

  describe('failed tests Record structure', () => {
    it('should create Record with moduleId as key', () => {
      const moduleId = '/path/to/file1.test.ts';
      const modules = [
        createMockTestModule(moduleId, [
          { name: 'failing test', state: 'failed', errors: [createTestError('error message')] },
        ]),
      ];

      const summary = buildSummary(modules);

      expect(summary.failed).toHaveProperty(moduleId);
      expect(Array.isArray(summary.failed[moduleId])).toBe(true);
    });

    it('should group multiple failures in same file', () => {
      const moduleId = '/path/to/file1.test.ts';
      const modules = [
        createMockTestModule(moduleId, [
          { name: 'test 1', state: 'failed', errors: [createTestError('error 1')] },
          { name: 'test 2', state: 'passed' },
          { name: 'test 3', state: 'failed', errors: [createTestError('error 2')] },
        ]),
      ];

      const summary = buildSummary(modules);

      expect(summary.failed[moduleId]).toHaveLength(2);
      expect(summary.failed[moduleId][0].testName).toBe('test 1');
      expect(summary.failed[moduleId][1].testName).toBe('test 3');
    });

    it('should separate failures by moduleId', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [
          { name: 'test 1', state: 'failed', errors: [createTestError('error 1')] },
        ]),
        createMockTestModule('/path/to/file2.test.ts', [
          { name: 'test 2', state: 'failed', errors: [createTestError('error 2')] },
        ]),
      ];

      const summary = buildSummary(modules);

      expect(Object.keys(summary.failed)).toHaveLength(2);
      expect(summary.failed['/path/to/file1.test.ts']).toHaveLength(1);
      expect(summary.failed['/path/to/file2.test.ts']).toHaveLength(1);
    });

    it('should include testName in failure record', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [
          { name: 'my failing test', state: 'failed', errors: [createTestError('error')] },
        ]),
      ];

      const summary = buildSummary(modules);
      const failures = summary.failed['/path/to/file1.test.ts'];

      expect(failures[0].testName).toBe('my failing test');
    });
  });

  describe('error extraction to string arrays', () => {
    it('should extract error message without stack', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [
          {
            name: 'test 1',
            state: 'failed',
            errors: [createTestError('Expected 1 to equal 2')],
          },
        ]),
      ];

      const summary = buildSummary(modules);
      const failures = summary.failed['/path/to/file1.test.ts'];

      expect(failures[0].errors).toEqual(['Expected 1 to equal 2']);
    });

    it('should extract error message with file and line from stack', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [
          {
            name: 'test 1',
            state: 'failed',
            errors: [createTestError('Expected 1 to equal 2', '/path/to/file1.test.ts', 42)],
          },
        ]),
      ];

      const summary = buildSummary(modules);
      const failures = summary.failed['/path/to/file1.test.ts'];

      expect(failures[0].errors).toEqual(['Expected 1 to equal 2 (/path/to/file1.test.ts:42)']);
    });

    it('should handle multiple errors for single test', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [
          {
            name: 'test 1',
            state: 'failed',
            errors: [
              createTestError('Error 1', '/path/to/file1.test.ts', 10),
              createTestError('Error 2', '/path/to/file1.test.ts', 20),
            ],
          },
        ]),
      ];

      const summary = buildSummary(modules);
      const failures = summary.failed['/path/to/file1.test.ts'];

      expect(failures[0].errors).toEqual([
        'Error 1 (/path/to/file1.test.ts:10)',
        'Error 2 (/path/to/file1.test.ts:20)',
      ]);
    });

    it('should return string array type for errors', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [
          {
            name: 'test 1',
            state: 'failed',
            errors: [createTestError('error')],
          },
        ]),
      ];

      const summary = buildSummary(modules);
      const failures = summary.failed['/path/to/file1.test.ts'];

      expect(Array.isArray(failures[0].errors)).toBe(true);
      expect(typeof failures[0].errors![0]).toBe('string');
    });

    it('should filter out empty errors', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [
          {
            name: 'test 1',
            state: 'failed',
            errors: [{ message: '', name: 'Error' } as TestError, createTestError('Real error')],
          },
        ]),
      ];

      const summary = buildSummary(modules);
      const failures = summary.failed['/path/to/file1.test.ts'];

      expect(failures[0].errors).toEqual(['Real error']);
    });
  });

  describe('duration aggregation', () => {
    it('should sum durations from all modules', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [{ name: 'test 1', state: 'passed' }], 100),
        createMockTestModule('/path/to/file2.test.ts', [{ name: 'test 2', state: 'passed' }], 200),
        createMockTestModule('/path/to/file3.test.ts', [{ name: 'test 3', state: 'passed' }], 50),
      ];

      const summary = buildSummary(modules);

      expect(summary.duration).toBe(350);
    });
  });

  describe('mixed test results', () => {
    it('should handle mix of passed, failed, and skipped tests', () => {
      const modules = [
        createMockTestModule(
          '/path/to/file1.test.ts',
          [
            { name: 'test 1', state: 'passed' },
            {
              name: 'test 2',
              state: 'failed',
              errors: [createTestError('assertion failed')],
            },
            { name: 'test 3', state: 'skipped' },
            { name: 'test 4', state: 'passed' },
          ],
          200,
        ),
      ];

      const summary = buildSummary(modules);

      expect(summary.total).toBe(4);
      expect(summary.passed).toBe(2);
      expect(summary.skipped).toBe(1);
      expect(Object.keys(summary.failed)).toHaveLength(1);
      expect(summary.failed['/path/to/file1.test.ts']).toHaveLength(1);
      expect(summary.duration).toBe(200);
    });

    it('should handle complex real-world scenario', () => {
      const modules = [
        createMockTestModule(
          '/src/auth.test.ts',
          [
            { name: 'should authenticate user', state: 'passed' },
            { name: 'should reject invalid credentials', state: 'passed' },
            {
              name: 'should handle network error',
              state: 'failed',
              errors: [createTestError('Network timeout', '/src/auth.test.ts', 45)],
            },
          ],
          150,
        ),
        createMockTestModule(
          '/src/database.test.ts',
          [
            { name: 'should connect to database', state: 'passed' },
            { name: 'should handle connection failure', state: 'skipped' },
            {
              name: 'should execute query',
              state: 'failed',
              errors: [
                createTestError('Query syntax error', '/src/database.test.ts', 23),
                createTestError('Connection lost', '/src/database.test.ts', 24),
              ],
            },
          ],
          200,
        ),
        createMockTestModule(
          '/src/utils.test.ts',
          [
            { name: 'should parse data', state: 'passed' },
            { name: 'should validate input', state: 'passed' },
            { name: 'should format output', state: 'passed' },
          ],
          75,
        ),
      ];

      const summary = buildSummary(modules);

      expect(summary.total).toBe(9);
      expect(summary.passed).toBe(6);
      expect(summary.skipped).toBe(1);
      expect(summary.duration).toBe(425);

      expect(Object.keys(summary.failed)).toHaveLength(2);
      expect(summary.failed['/src/auth.test.ts']).toHaveLength(1);
      expect(summary.failed['/src/auth.test.ts'][0].testName).toBe('should handle network error');
      expect(summary.failed['/src/auth.test.ts'][0].errors).toEqual([
        'Network timeout (/src/auth.test.ts:45)',
      ]);

      expect(summary.failed['/src/database.test.ts']).toHaveLength(1);
      expect(summary.failed['/src/database.test.ts'][0].testName).toBe('should execute query');
      expect(summary.failed['/src/database.test.ts'][0].errors).toEqual([
        'Query syntax error (/src/database.test.ts:23)',
        'Connection lost (/src/database.test.ts:24)',
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty modules and module with no tests', () => {
      const emptyModules = buildSummary([]);
      expect(emptyModules.total).toBe(0);
      expect(emptyModules.failed).toEqual({});
      expect(emptyModules.duration).toBe(0);

      const noTests = buildSummary([createMockTestModule('/path/to/empty.test.ts', [], 10)]);
      expect(noTests.total).toBe(0);
      expect(noTests.duration).toBe(10);
    });

    it('should handle all tests with same state', () => {
      const allPassed = buildSummary([
        createMockTestModule('/path/to/file1.test.ts', [
          { name: 'test 1', state: 'passed' },
          { name: 'test 2', state: 'passed' },
        ]),
      ]);
      expect(allPassed.passed).toBe(2);
      expect(allPassed.failed).toEqual({});

      const allFailed = buildSummary([
        createMockTestModule('/path/to/file2.test.ts', [
          { name: 'test 1', state: 'failed', errors: [createTestError('e1')] },
          { name: 'test 2', state: 'failed', errors: [createTestError('e2')] },
        ]),
      ]);
      expect(allFailed.passed).toBe(0);
      expect(allFailed.failed['/path/to/file2.test.ts']).toHaveLength(2);

      const allSkipped = buildSummary([
        createMockTestModule('/path/to/file3.test.ts', [
          { name: 'test 1', state: 'skipped' },
          { name: 'test 2', state: 'skipped' },
        ]),
      ]);
      expect(allSkipped.skipped).toBe(2);
      expect(allSkipped.failed).toEqual({});
    });

    it('should handle failed test with empty errors array', () => {
      const modules = [
        createMockTestModule('/path/to/file1.test.ts', [
          { name: 'test 1', state: 'failed', errors: [] },
        ]),
      ];

      const summary = buildSummary(modules);

      expect(summary.failed['/path/to/file1.test.ts'][0].errors).toEqual([]);
    });
  });
});
