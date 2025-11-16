/**
 * Example usage of result-formatter
 *
 * This file demonstrates how to use the formatResults function
 * to convert Vitest TestModule results into AI-optimized summaries.
 *
 * @example Basic compact output (failed tests only)
 * ```typescript
 * import { formatResults } from './result-formatter.js';
 * import type { TestModule } from 'vitest/node';
 *
 * // After running tests via Vitest API
 * const testModules: readonly TestModule[] = await vitest.collectTests();
 *
 * // Compact format - only failed tests (default when no filters specified)
 * const summary = formatResults(testModules, {
 *   includeStackTraces: false,  // Omit stack traces for brevity
 *   sessionId: 'session-abc123',
 * });
 *
 * console.log(JSON.stringify(summary, null, 2));
 * // Output:
 * // {
 * //   "total": 50,
 * //   "passed": 47,
 * //   "failed": 3,
 * //   "skipped": 0,
 * //   "duration": 2341,
 * //   "files": [
 * //     {
 * //       "file": "/project/src/auth.test.ts",
 * //       "tests": [
 * //         {
 * //           "id": "auth_login_invalid_credentials",
 * //           "name": "should reject invalid credentials",
 * //           "fullName": "Auth > login > should reject invalid credentials",
 * //           "file": "/project/src/auth.test.ts",
 * //           "status": "failed",
 * //           "duration": 234,
 * //           "error": {
 * //             "message": "Expected status 401, received 200",
 * //             "expected": 401,
 * //             "actual": 200
 * //           },
 * //           "consoleCount": 3
 * //         }
 * //       ],
 * //       "duration": 456,
 * //       "consoleCount": 5
 * //     }
 * //   ],
 * //   "console": {
 * //     "total": 15,
 * //     "byStream": {
 * //       "stdout": 12,
 * //       "stderr": 3
 * //     }
 * //   }
 * // }
 * ```
 *
 * @example Verbose output with all tests and stack traces
 * ```typescript
 * // Verbose format - all tests (use testFile or testName filter to show all statuses)
 * const verboseSummary = formatResults(testModules, {
 *   testFile: 'src/auth/*.test.ts',  // Filter triggers showing all test statuses
 *   includeStackTraces: true,  // Include full stack traces
 *   sessionId: 'session-abc123',
 * }, consoleStorage);
 *
 * // When testFile or testName filters are specified, all test statuses are shown
 * // (passed, failed, skipped), not just failures
 * ```
 *
 * @example Type discrimination for error handling
 * ```typescript
 * import type { TestResult } from 'vitest/node';
 *
 * function processTestResult(result: TestResult) {
 *   // TypeScript discriminated union - type guard on state
 *   if (result.state === 'failed') {
 *     // result.errors is ReadonlyArray<TestError>
 *     const firstError = result.errors[0];
 *     console.log('Test failed:', firstError.message);
 *   } else if (result.state === 'passed') {
 *     // result.errors is undefined (might exist if retried)
 *     console.log('Test passed');
 *   } else if (result.state === 'skipped') {
 *     // result.errors is undefined
 *     console.log('Test skipped:', result.note);
 *   }
 * }
 * ```
 */

// This file is for documentation purposes only - no runtime code
export {};
