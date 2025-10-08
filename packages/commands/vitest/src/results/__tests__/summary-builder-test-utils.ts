import type { TestModule } from 'vitest/node';
import type { TestError } from '@vitest/utils';

/**
 * Creates a mock TestModule with realistic structure matching vitest's API.
 *
 * @param moduleId - The module file path/ID
 * @param tests - Array of test configurations
 * @param duration - Module execution duration in milliseconds
 * @returns Mock TestModule instance
 */
export function createMockTestModule(
  moduleId: string,
  tests: Array<{
    name: string;
    state: 'passed' | 'failed' | 'skipped';
    errors?: TestError[];
  }>,
  duration = 100,
): TestModule {
  const mockModule = {
    moduleId,
    type: 'module' as const,
    diagnostic: () => ({
      duration,
      environmentSetupDuration: 10,
      prepareDuration: 5,
      collectDuration: 5,
      setupDuration: 0,
      heap: undefined,
      importDurations: {},
    }),
    children: {
      allTests: function* () {
        for (const test of tests) {
          yield {
            name: test.name,
            module: mockModule,
            result: () => ({
              state: test.state,
              errors: test.errors,
            }),
          };
        }
      },
    },
  } as unknown as TestModule;

  return mockModule;
}

/**
 * Creates a TestError with optional stack trace.
 *
 * @param message - Error message
 * @param file - File path for stack trace (optional)
 * @param line - Line number for stack trace (optional)
 * @returns Mock TestError instance
 */
export function createTestError(message: string, file?: string, line?: number): TestError {
  const error: TestError = {
    message,
    name: 'AssertionError',
  };

  if (file && line) {
    error.stacks = [
      {
        method: 'test',
        file,
        line,
        column: 1,
      },
    ];
  }

  return error;
}
