# Vitest Test Utilities

Shared utilities for integration testing the vitest command with REAL vitest sessions.

## Overview

The test utilities follow the same pattern as `js-debugger/test/utils.ts`, providing:
- Fixture management for vitest projects
- Session lifecycle management
- Cleanup helpers
- Async wait utilities

## Usage Example

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createVitestFixture } from './utils.js';

describe('Vitest Integration Tests', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('should run basic tests successfully', async () => {
    // Create fixture with real vitest session
    const { manager, sessionId, fixture, cleanup: _cleanup } = await createVitestFixture(
      'basic-project',
    );
    cleanup = _cleanup;

    // Get results
    const results = manager.getResults({ sessionId });

    // Assertions
    expect(results.summary.total).toBeGreaterThan(0);
    expect(results.summary.passed).toBeGreaterThan(0);
    expect(results.summary.failed).toBe(0);
  });

  it('should handle custom configuration', async () => {
    const { manager, sessionId, cleanup: _cleanup } = await createVitestFixture(
      'basic-project',
      {
        timeout: 10000,
        maxConsoleEntries: 5000,
      },
    );
    cleanup = _cleanup;

    const status = manager.getSessionStatus(sessionId);
    expect(status.status).toMatch(/completed|running/);
  });
});
```

## API Reference

### `createVitestFixture(fixtureName, config?)`

Main factory function for creating integration test fixtures with real vitest sessions.

**Parameters:**
- `fixtureName: string` - Name of the fixture directory under `test/fixtures/`
- `config?: Partial<VitestSessionConfig>` - Optional session configuration overrides

**Returns:** `Promise<VitestFixtureResult>`
- `manager: VitestSessionManager` - Session manager instance
- `sessionId: string` - ID of the running test session
- `fixture: FixtureHandle` - Handle to the fixture project
- `cleanup: () => Promise<void>` - Cleanup function (prevents double-execution)

**Example:**
```typescript
const { manager, sessionId, fixture, cleanup } = await createVitestFixture('basic-project');
try {
  // Run your tests...
  const results = manager.getResults({ sessionId });
  expect(results.summary.passed).toBeGreaterThan(0);
} finally {
  await cleanup();
}
```

### Fixture Structure

Fixtures are complete vitest projects located in `test/fixtures/`:

```
test/fixtures/
├── basic-project/
│   ├── package.json
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── calculator.ts
│       └── __tests__/
│           └── example.test.ts
├── failing-tests/
│   └── ...
└── console-output/
    └── ...
```

### Helper Utilities

#### `waitForSessionCompletion(manager, sessionId, options?)`

Waits for a vitest session to reach completion status.

**Parameters:**
- `manager: VitestSessionManager`
- `sessionId: string`
- `options?: WaitOptions` - `{ timeoutMs?: number, intervalMs?: number }`

#### `waitForSessionStatus(manager, sessionId, status, options?)`

Waits for a session to reach specific status(es).

**Parameters:**
- `manager: VitestSessionManager`
- `sessionId: string`
- `status: SessionStatus | SessionStatus[]` - Target status(es)
- `options?: WaitOptions`

#### `cleanupSession(manager, sessionId)`

Gracefully cleans up a vitest session.

**Parameters:**
- `manager: VitestSessionManager`
- `sessionId: string | undefined`

## Important Notes

### Real vs Mock Tests

- **DO** use these utilities for INTEGRATION tests that run REAL vitest sessions
- **DON'T** use these utilities for unit tests - use mocks from `src/session/__tests__/test-utils.ts` instead

### Resource Cleanup

Always ensure cleanup is called, even if the test fails:

```typescript
// ✅ Good - cleanup in afterEach
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

it('my test', async () => {
  const result = await createVitestFixture('basic-project');
  cleanup = result.cleanup;
  // ... test code ...
});
```

```typescript
// ✅ Also good - try/finally
const { cleanup } = await createVitestFixture('basic-project');
try {
  // ... test code ...
} finally {
  await cleanup();
}
```

```typescript
// ❌ Bad - cleanup might not run on failure
const { cleanup } = await createVitestFixture('basic-project');
// ... test code ...
await cleanup(); // Won't run if test throws
```

### Fixture Isolation

Each test gets an isolated copy of the fixture in a temporary directory. This allows vitest to write output files without affecting the original fixtures or other tests.

### Session Manager Lifecycle

The `VitestSessionManager` starts internal cleanup intervals. Always call `cleanup()` to properly destroy the manager and prevent resource leaks.
