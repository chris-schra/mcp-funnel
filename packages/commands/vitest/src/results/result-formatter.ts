import micromatch from 'micromatch';
import type { TestModule } from 'vitest/node';
import type { TestError } from '@vitest/utils';
import type { TestSummary, TestFileResult, TestCaseResult } from '../types/index.js';
import type { ConsoleStorage } from '../console/console-storage.js';

/**
 * Format options for test results
 */
export interface FormatOptions {
  /**
   * Include full stack traces in error details
   */
  includeStackTraces?: boolean;

  /**
   * Session ID for console query context
   */
  sessionId?: string;

  /**
   * Glob pattern to filter test files (e.g., "** /*.spec.ts" without the space)
   */
  testFile?: string;

  /**
   * Glob pattern to filter test names (e.g., "*should*")
   */
  testName?: string;
}

/**
 * Formats test results from vitest TestModule hierarchy into AI-optimized compact summary
 * @param testModules - Array of test modules from vitest
 * @param options - Formatting options for output customization
 * @param consoleStorage - Optional console storage for capturing test output
 * @returns Test summary with aggregated results and metadata
 */
export function formatResults(
  testModules: readonly TestModule[],
  options: FormatOptions = {},
  consoleStorage?: ConsoleStorage,
): TestSummary {
  const { includeStackTraces = false, sessionId, testFile, testName } = options;

  // Determine if explicit filters are present
  // When filters are provided (testFile or testName), show all test statuses
  // When no filters are provided, show only failed tests
  const hasExplicitFilters = !!testFile || !!testName;

  // Initialize totals
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let skippedTests = 0;
  let totalDuration = 0;

  const fileResults: TestFileResult[] = [];

  // Process each test module
  for (const testModule of testModules) {
    const moduleDiagnostic = testModule.diagnostic();
    const moduleId = testModule.moduleId;

    // Skip entire file if it doesn't match testFile glob
    if (testFile && !micromatch.isMatch(moduleId, testFile)) {
      totalDuration += moduleDiagnostic.duration;
      continue;
    }

    const testCaseResults: TestCaseResult[] = [];

    // Iterate through all tests in this module
    for (const testCase of testModule.children.allTests()) {
      totalTests++;

      const result = testCase.result();

      // Update totals based on test state
      if (result.state === 'passed') {
        passedTests++;
      } else if (result.state === 'failed') {
        failedTests++;
      } else if (result.state === 'skipped') {
        skippedTests++;
      }

      // Process test case and add to results if not filtered
      const testCaseResult = processTestCase(
        testCase,
        moduleId,
        includeStackTraces,
        hasExplicitFilters,
        consoleStorage,
        sessionId,
        options,
      );

      if (testCaseResult) {
        testCaseResults.push(testCaseResult);
      }
    }

    // Skip files with no results (only happens when showing failed tests only)
    if (testCaseResults.length === 0 && !hasExplicitFilters) {
      totalDuration += moduleDiagnostic.duration;
      continue;
    }

    // Get console count for this file
    const fileConsoleCount = getConsoleCountForFile(consoleStorage, sessionId, moduleId);

    // Build file result
    const fileResult: TestFileResult = {
      file: moduleId,
      tests: testCaseResults,
      duration: moduleDiagnostic.duration,
      consoleCount: fileConsoleCount,
    };

    fileResults.push(fileResult);
    totalDuration += moduleDiagnostic.duration;
  }

  // Build console stats
  const consoleStats = getConsoleStats(consoleStorage, sessionId);

  return {
    total: totalTests,
    passed: passedTests,
    failed: failedTests,
    skipped: skippedTests,
    duration: totalDuration,
    files: fileResults,
    console: consoleStats,
  };
}

/**
 * Check if test case matches the provided filters
 * @param testCase - Test case to check
 * @param moduleId - File path of the test module
 * @param options - Format options containing filter patterns
 * @returns True if test case matches all filters
 */
function matchesFilters(
  testCase: ReturnType<TestModule['children']['allTests']> extends Iterable<infer T> ? T : never,
  moduleId: string,
  options: FormatOptions,
): boolean {
  if (options.testFile && !micromatch.isMatch(moduleId, options.testFile)) {
    return false;
  }
  if (options.testName && !micromatch.isMatch(testCase.fullName, options.testName)) {
    return false;
  }
  return true;
}

/**
 * Processes individual test case and returns result with metadata
 * @param testCase - Individual test case from test module
 * @param moduleId - File path of the test module
 * @param includeStackTraces - Whether to include full stack traces
 * @param hasExplicitFilters - Whether explicit filters are provided (testFile or testName)
 * @param consoleStorage - Optional console storage for test output
 * @param sessionId - Session ID for console queries
 * @param options - Format options containing filter patterns
 * @returns Test case result object or null if filtered out
 */
function processTestCase(
  testCase: ReturnType<TestModule['children']['allTests']> extends Iterable<infer T> ? T : never,
  moduleId: string,
  includeStackTraces: boolean,
  hasExplicitFilters: boolean,
  consoleStorage: ConsoleStorage | undefined,
  sessionId: string | undefined,
  options: FormatOptions,
): TestCaseResult | null {
  const result = testCase.result();
  const diagnostic = testCase.diagnostic();
  const duration = diagnostic?.duration ?? 0;

  // Skip test if it doesn't match filters
  if (!matchesFilters(testCase, moduleId, options)) {
    return null;
  }

  // When no explicit filters are provided, show only failed tests
  // When explicit filters are provided (testFile or testName), show all test statuses
  if (!hasExplicitFilters && result.state !== 'failed') {
    return null;
  }

  // Get console count for this test
  const consoleCount = getConsoleCountForTest(consoleStorage, sessionId, testCase.id);

  // Build test case result
  const testCaseResult: TestCaseResult = {
    id: testCase.id,
    name: testCase.name,
    fullName: testCase.fullName,
    file: moduleId,
    status: mapTestStatus(result.state),
    duration,
    consoleCount,
  };

  // Add error details for failed tests
  if (result.state === 'failed') {
    testCaseResult.error = extractErrorDetails(result, includeStackTraces);
  }

  return testCaseResult;
}

/**
 * Maps vitest test state to our status format
 * @param state - Vitest test state
 * @returns Mapped status string
 */
function mapTestStatus(
  state: 'passed' | 'failed' | 'skipped' | 'pending',
): 'passed' | 'failed' | 'skipped' | 'pending' {
  return state;
}

/**
 * Extracts error details from a failed test result
 * @param result - Failed test result containing error information
 * @param includeStackTraces - Whether to include full stack traces in output
 * @returns Formatted error details with message, stack, and assertion data
 */
function extractErrorDetails(
  result: { state: 'failed'; errors: ReadonlyArray<TestError> },
  includeStackTraces: boolean,
): TestCaseResult['error'] {
  const firstError = result.errors?.[0];
  if (!firstError) {
    return {
      message: 'Unknown error',
    };
  }

  const error: NonNullable<TestCaseResult['error']> = {
    message: firstError.message || 'Unknown error',
  };

  // Add stack trace if requested
  if (includeStackTraces && firstError.stack) {
    error.stack = firstError.stack;
  }

  // Extract assertion details if available (from chai/vitest assertions)
  if ('expected' in firstError && firstError.expected !== undefined) {
    error.expected = firstError.expected;
  }
  if ('actual' in firstError && firstError.actual !== undefined) {
    error.actual = firstError.actual;
  }
  if ('diff' in firstError && firstError.diff) {
    error.diff = firstError.diff;
  }

  return error;
}

/**
 * Gets console entry count for a specific test
 * @param consoleStorage - Console storage instance for querying logs
 * @param sessionId - Session ID to scope the query
 * @param testId - Unique test identifier
 * @returns Number of console entries for the test
 */
function getConsoleCountForTest(
  consoleStorage: ConsoleStorage | undefined,
  sessionId: string | undefined,
  testId: string,
): number {
  if (!consoleStorage || !sessionId) {
    return 0;
  }

  try {
    const entries = consoleStorage.query(sessionId, {
      sessionId,
      taskId: testId,
      limit: 0, // We only want the count
    });
    return entries.length;
  } catch {
    return 0;
  }
}

/**
 * Gets console entry count for a specific file
 * @param consoleStorage - Console storage instance for querying logs
 * @param sessionId - Session ID to scope the query
 * @param testFile - File path of the test module
 * @returns Number of console entries for the file
 */
function getConsoleCountForFile(
  consoleStorage: ConsoleStorage | undefined,
  sessionId: string | undefined,
  testFile: string,
): number {
  if (!consoleStorage || !sessionId) {
    return 0;
  }

  try {
    const entries = consoleStorage.query(sessionId, {
      sessionId,
      testFile,
    });
    return entries.length;
  } catch {
    return 0;
  }
}

/**
 * Gets overall console statistics
 * @param consoleStorage - Console storage instance for querying stats
 * @param sessionId - Session ID to scope the query
 * @returns Aggregated console statistics including total and per-stream counts
 */
function getConsoleStats(
  consoleStorage: ConsoleStorage | undefined,
  sessionId: string | undefined,
): TestSummary['console'] {
  if (!consoleStorage || !sessionId) {
    return {
      total: 0,
      byStream: {
        stdout: 0,
        stderr: 0,
      },
    };
  }

  try {
    const stats = consoleStorage.getStats(sessionId);
    return {
      total: stats.total,
      byStream: {
        stdout: stats.byStream.stdout,
        stderr: stats.byStream.stderr,
      },
    };
  } catch {
    return {
      total: 0,
      byStream: {
        stdout: 0,
        stderr: 0,
      },
    };
  }
}
