/**
 * MemoryTokenStorage test suite
 *
 * Tests have been split into focused modules for maintainability:
 * - token-lifecycle.test.ts: Store, retrieve, clear operations
 * - expiry-management.test.ts: Token expiration detection
 * - callback-management.test.ts: Refresh callback scheduling
 * - threading-safety.test.ts: Concurrent operation handling
 * - security.test.ts: Security validations and sanitization
 * - performance.test.ts: Performance and memory characteristics
 *
 * @see {@link createMemoryTokenStorage}
 */

// This file serves as documentation that tests are organized in separate modules.
// Individual test suites are located in the memory-token-storage/ subdirectory.
