# @mcp-funnel/command-vitest

Vitest test runner command for MCP Funnel - run tests, query results, and search console output with AI-optimized responses.

## Features

- **Timeout Management**: User-facing timeout returns partial results while tests continue
- **Memory Safety**: LRU cache with TTL prevents memory overflow
- **Console Querying**: Search and filter console output by test, stream type, or text pattern
- **AI-Optimized Output**: Compact results by default (failed tests only), progressive disclosure
- **Test Selection**: Run specific files or test name patterns

## MCP Tools

### `vitest_startSession`
Start a test session with optional timeout and test selection.

### `vitest_getResults`
Query test results (failed only by default, opt-in for full results).

### `vitest_queryConsole`
Search console output with filters.

### `vitest_getSessionStatus`
Check status of running or completed session.

## Example Usage

```typescript
// Step 1: Run tests (returns minimal response with summary stats only)
const { sessionId, summary } = await mcpClient.callTool('vitest_startSession', {
  tests: ['auth/login.test.ts', 'MyComponent.*renders'],
  timeout: 60000
});
// summary: { total: 100, passed: 95, failed: 5, skipped: 0, duration: 5000 }

// Step 2: Get all failed tests (default when no filters specified)
const failedResults = await mcpClient.callTool('vitest_getResults', {
  sessionId
});
// results.summary: { total: 100, passed: 95, failed: 5, skipped: 0, duration: 5000 }
// results.queryResults.files: [/* failed tests only */]

// Step 3: Get all tests from specific file pattern (all statuses: passed/failed/skipped)
const authResults = await mcpClient.callTool('vitest_getResults', {
  sessionId,
  testFile: 'auth/**/*.test.ts'
});
// results.queryResults.files: [/* all tests from auth directory */]

// Step 4: Get tests by name pattern (all statuses)
const validationTests = await mcpClient.callTool('vitest_getResults', {
  sessionId,
  testName: '*should validate*',
  includeStackTraces: true
});
// results.queryResults.files: [/* all tests with "should validate" in name */]

// Step 5: Search console for errors
const logs = await mcpClient.callTool('vitest_queryConsole', {
  sessionId,
  search: 'error',
  streamType: 'stderr'
});
```
