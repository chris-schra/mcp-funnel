# @mcp-funnel/command-vitest

Vitest test runner for CLI and MCP protocol usage with AI-optimized output.

## Features

- ✅ **Session-Based Testing** - Run tests and query results progressively
- ✅ **Timeout Management** - User timeout returns partial results, hard timeout kills process
- ✅ **Console Capture** - Search and filter console output by test, stream, or regex
- ✅ **AI-Optimized Output** - Minimal responses by default, progressive disclosure
- ✅ **Memory Safety** - LRU cache with TTL prevents unbounded growth
- ✅ **Dual Interface** - CLI and MCP protocol

## Quick Start

### Try it via CLI

```bash
# Run all tests in your project
npx mcp-funnel run vitest start

# Run tests matching a pattern
npx mcp-funnel run vitest start "**/*.test.ts"

# Get help
npx mcp-funnel run vitest --help
```

### Usage in Claude Code, Codex CLI, Gemini CLI

Prompt:
```
run my vitest tests and show me what failed
```

Claude will call `vitest_startSession` with:
```json
{
  "timeout": 30000
}
```

Then automatically call `vitest_getResults` to see failures:
```json
{
  "sessionId": "abc-123"
}
```

Prompt:
```
search the test console output for "connection error"
```

Claude will call `vitest_queryConsole` with:
```json
{
  "sessionId": "abc-123",
  "search": "connection error",
  "streamType": "both"
}
```

## CLI Usage

### Run Tests

```bash
# Run all tests
npx mcp-funnel run vitest start

# Run tests matching pattern
npx mcp-funnel run vitest start "auth/**/*.test.ts"

# Show help
npx mcp-funnel run vitest help
```

The CLI starts a session and displays summary stats. Use the MCP tools for detailed querying.

## MCP Protocol Usage

When exposed via MCP, the command provides four tools:

### `vitest_startSession`

Start a test session and return summary statistics.

**Input Schema:**

```typescript
{
  "tests": string[]?,           // File paths OR test name patterns
  "testPattern": string?,       // Glob pattern for test files
  "root": string?,              // Project root directory
  "configPath": string?,        // Full path to vitest config file
  "timeout": number?,           // User timeout in ms (default: 30000)
  "maxTimeout": number?,        // Hard timeout in ms (default: 120000)
  "maxConsoleEntries": number?, // Max console entries (default: 10000)
  "consoleLogTTL": number?      // Console TTL in ms (default: 300000)
}
```

**Returns:**
```typescript
{
  "sessionId": string,
  "status": "completed" | "timeout" | "killed",
  "summary": {
    "total": number,
    "passed": number,
    "failed": Record<string, Array<{testName: string, errors: string[]}>>,
    "skipped": number,
    "duration": number
  },
  "message"?: string,
  "suggestions"?: string[]
}
```

**Example:**

```json
{
  "tool": "vitest_startSession",
  "arguments": {
    "tests": ["auth/**/*.test.ts"],
    "timeout": 60000
  }
}
```

### `vitest_getResults`

Query test results from a session.

**Behavior:**
- **No filters**: Returns summary + failed tests only
- **With filters** (testFile/testName): Returns summary + all matching tests (passed/failed/skipped)

**Input Schema:**

```typescript
{
  "sessionId": string,          // Required: session identifier
  "includeStackTraces": boolean?, // Include full stack traces (default: true)
  "testFile": string?,          // Glob pattern for files (e.g., "auth/**/*.test.ts")
  "testName": string?           // Glob pattern for test names (e.g., "*should validate*")
}
```

**Example:**

```json
{
  "tool": "vitest_getResults",
  "arguments": {
    "sessionId": "abc-123",
    "testFile": "auth/**/*.test.ts"
  }
}
```

### `vitest_queryConsole`

Search and filter console output from test execution.

**Input Schema:**

```typescript
{
  "sessionId": string,          // Required: session identifier
  "streamType": "stdout" | "stderr" | "both"?, // Filter by stream (default: both)
  "taskId": string?,            // Filter by test task ID
  "testFile": string?,          // Filter by test file (substring match)
  "testName": string?,          // Filter by test name (substring match)
  "search": string?,            // Search text in messages
  "useRegex": boolean?,         // Treat search as regex (default: false)
  "caseSensitive": boolean?,    // Case-sensitive search (default: false)
  "limit": number?,             // Max entries to return (default: 100)
  "skip": number?,              // Pagination offset (default: 0)
  "after": number?,             // Timestamp filter (ms)
  "before": number?             // Timestamp filter (ms)
}
```

**Example:**

```json
{
  "tool": "vitest_queryConsole",
  "arguments": {
    "sessionId": "abc-123",
    "search": "error",
    "streamType": "stderr",
    "limit": 50
  }
}
```

### `vitest_getSessionStatus`

Get current status of a test session.

**Input Schema:**

```typescript
{
  "sessionId": string  // Required: session identifier
}
```

**Example:**

```json
{
  "tool": "vitest_getSessionStatus",
  "arguments": {
    "sessionId": "abc-123"
  }
}
```

## Configuration

Add the vitest command to your `.mcp-funnel.json`:

```json
{
  "commands": {
    "enabled": true,
    "list": ["vitest"]
  },
  "exposeTools": ["vitest_*"]
}
```

### Filtering Tools

Expose only specific vitest tools:

```json
{
  "commands": {
    "enabled": true,
    "list": ["vitest"]
  },
  "exposeTools": [
    "vitest_startSession",
    "vitest_getResults",
    "vitest_queryConsole"
  ]
}
```

## Architecture

### Test Selection Heuristic

The `tests` array accepts both file paths and test name patterns. Heuristic:
- Contains `/` or ends with `.ts`/`.js`/`.tsx`/`.jsx` → treated as file path
- Otherwise → treated as test name pattern

Examples:
```json
{
  "tests": [
    "auth/login.test.ts",        // File path
    "MyComponent > should render" // Test name pattern
  ]
}
```

### Memory Management

- **LRU Cache**: Evicts oldest entries when `maxEntries` is reached
- **TTL Eviction**: Removes entries after `consoleLogTTL` expires
- **Per-Session Limits**: Enforces `maxEntriesPerSession` per test session
- **Session TTL**: Sessions expire after 1 hour

### Timeout Behavior

**User Timeout** (default: 30s):
- Returns partial results with `status: "timeout"`
- Tests continue running in background
- Provides suggestions for next steps

**Hard Timeout** (default: 2 × user timeout or 120s):
- Kills vitest process
- Returns partial results with `status: "killed"`
- Prevents runaway processes

## License

MIT
