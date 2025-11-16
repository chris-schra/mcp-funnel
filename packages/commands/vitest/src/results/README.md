# Result Formatter

Converts Vitest `TestModule` results into AI-optimized compact summaries.

## Usage

```typescript
import { formatResults } from './result-formatter.js';
import type { TestModule } from 'vitest/node';

// After running tests and getting TestModules from Vitest
const testModules: readonly TestModule[] = await vitest.start();

// Compact format (default): only failed tests
// When no testFile/testName filters are specified, only failed tests are shown
const summary = formatResults(testModules, {
  includeStackTraces: false,
  sessionId: 'session-123',
}, consoleStorage);

console.log(summary);
// {
//   total: 10,
//   passed: 7,
//   failed: 3,
//   skipped: 0,
//   duration: 1234,
//   files: [
//     {
//       file: '/path/to/test.spec.ts',
//       tests: [
//         {
//           id: 'test-id-1',
//           name: 'should fail',
//           fullName: 'Suite > should fail',
//           file: '/path/to/test.spec.ts',
//           status: 'failed',
//           duration: 123,
//           error: {
//             message: 'Expected 1 to equal 2',
//             stack: '...',
//             expected: 2,
//             actual: 1,
//             diff: '...'
//           },
//           consoleCount: 5
//         }
//       ],
//       duration: 456,
//       consoleCount: 10
//     }
//   ],
//   console: {
//     total: 20,
//     byStream: {
//       stdout: 15,
//       stderr: 5
//     }
//   }
// }

// Verbose format: all tests with stack traces
// Specify testFile or testName filter to show all test statuses (passed, failed, skipped)
const verboseSummary = formatResults(testModules, {
  testFile: 'src/auth/*.test.ts',  // Using a filter shows all test statuses
  includeStackTraces: true,
  sessionId: 'session-123',
}, consoleStorage);
```

## Features

### Smart Filtering
- **No filters** (no testFile/testName): Shows only failed tests
- **With filters** (testFile or testName specified): Shows all test statuses (passed, failed, skipped)
- Reduces token usage for AI by focusing on relevant information

### Type Safety
- Uses proper TypeScript discriminated unions for `TestResult`
- Type guards ensure correct error extraction based on test state

### Console Integration
- Queries `ConsoleStorage` for per-test and per-file console counts
- Includes overall console statistics (stdout/stderr breakdown)

### Error Details
- Extracts error message, stack trace, expected/actual values, and diff
- Stack traces are optional via `includeStackTraces` flag

## Type Discrimination Example

```typescript
function extractError(result: TestResult): ErrorDetails | undefined {
  // Type guard: only 'failed' results have errors
  if (result.state === 'failed') {
    // TypeScript knows result.errors is ReadonlyArray<TestError>
    return {
      message: result.errors?.[0]?.message || 'Unknown error',
      stack: result.errors?.[0]?.stack,
      expected: result.errors?.[0]?.expected,
      actual: result.errors?.[0]?.actual,
      diff: result.errors?.[0]?.diff,
    };
  }
  // For other states (passed, skipped, pending), errors are undefined
  return undefined;
}
```
