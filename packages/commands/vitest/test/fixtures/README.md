# Vitest Test Fixtures

This directory contains real vitest test fixture projects used for testing the vitest runner functionality. Each fixture is a standalone, runnable vitest project designed to test specific scenarios.

## Available Fixtures

### 1. basic-project/
**Purpose**: Simple passing tests with module imports

**Contents**:
- `src/calculator.ts` - Simple calculator module
- `src/__tests__/example.test.ts` - 6 passing tests

**Test results**: ✅ All tests pass (6/6)

**Use case**: Verify basic test execution, module resolution, and passing test reporting.

**Run**:
```bash
cd basic-project && vitest run
```

---

### 2. failing-tests/
**Purpose**: Intentional test failures for error reporting

**Contents**:
- `tests/failures.test.ts` - 7 tests (1 passed, 5 failed, 1 skipped)

**Test results**:
- ✅ 1 passed
- ❌ 5 failed (assertion errors, thrown errors, object/array diffs)
- ⏭️ 1 skipped

**Use case**: Verify error reporting, diff output, expected/actual values, and skipped test handling.

**Run**:
```bash
cd failing-tests && vitest run
```

---

### 3. console-output/
**Purpose**: Console logging tests (stdout/stderr)

**Contents**:
- `tests/console.test.ts` - 10 passing tests with various console output

**Test results**: ✅ All tests pass (10/10)

**Console output**:
- `console.log` - stdout
- `console.error` - stderr
- `console.warn` - stderr
- Objects, arrays, multiline logs

**Use case**: Verify console output capture, association with test cases, and stdout/stderr differentiation.

**Run**:
```bash
cd console-output && vitest run
```

---

### 4. custom-config/
**Purpose**: Custom vitest configuration

**Contents**:
- `custom-tests/special.test.ts` - 6 passing tests
- Custom test location (custom-tests/ instead of test/ or __tests__/)
- Strict TypeScript mode enabled
- Custom testMatch pattern in vitest.config.ts

**Test results**: ✅ All tests pass (6/6)

**Use case**: Verify custom vitest configuration handling, non-standard test locations, and strict TypeScript mode.

**Run**:
```bash
cd custom-config && vitest run
```

---

## Running All Fixtures

From this directory:
```bash
for dir in */; do
  echo "Testing $dir..."
  (cd "$dir" && vitest run)
done
```

## Fixture Requirements

Each fixture:
- ✅ Is a standalone, runnable vitest project
- ✅ Has package.json for dependency resolution
- ✅ Has tsconfig.json for TypeScript configuration
- ✅ Has vitest.config.ts for vitest configuration
- ✅ Tests complete quickly (< 100ms per test)
- ✅ Tests are well-commented

## Notes

- These fixtures are used by REAL vitest execution (not mocks)
- They are excluded from the main project's TypeScript compilation (see root tsconfig.json)
- Each fixture is self-contained and can be run independently
- Tests are designed to be deterministic and fast
