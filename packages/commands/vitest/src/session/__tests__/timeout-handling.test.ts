import { describe, it, expect } from 'vitest';
import { createVitestFixture } from '../../../test/utils.js';

describe('VitestSessionManager - Timeout Handling', () => {
  it('should handle user timeout with short timeout value', async () => {
    // Use a very short timeout to trigger timeout during test execution
    const { manager, sessionId, cleanup } = await createVitestFixture('basic-project', {
      timeout: 100, // Very short timeout to trigger user timeout
    });

    try {
      const status = manager.getSessionStatus(sessionId);

      // Should have timed out or completed quickly
      expect(['timeout', 'completed']).toContain(status.status);

      // Summary should be available (may be partial if timed out, or complete if tests finished)
      if (status.summary) {
        expect(status.summary.total).toBeGreaterThanOrEqual(0);
      }

      if (status.status === 'completed') {
        // If completed, verify we have test results
        expect(status.summary).toBeDefined();
        expect(status.summary?.total).toBeGreaterThan(0);
      }
    } finally {
      await cleanup();
    }
  });

  it('should handle session with failed tests', async () => {
    // failing-tests fixture has 5 failed tests, 1 passed, 1 skipped
    const { manager, sessionId, cleanup } = await createVitestFixture('failing-tests');

    try {
      const status = manager.getSessionStatus(sessionId);

      expect(status.status).toBe('completed');

      // Verify we captured failures
      expect(status.summary).toBeDefined();
      expect(status.summary?.total).toBe(7); // Total 7 tests
      expect(status.summary?.passed).toBe(1); // 1 passed
      expect(status.summary?.skipped).toBe(1); // 1 skipped

      // Get detailed results to verify error information
      const results = manager.getResults({ sessionId });
      expect(results.summary.failed).toBeDefined();

      // Check that we have failure details
      const failedTestFiles = Object.values(results.summary.failed);
      expect(failedTestFiles.length).toBeGreaterThan(0);

      // Count total failed tests across all files
      const totalFailedTests = failedTestFiles.reduce(
        (sum, fileFailures) => sum + fileFailures.length,
        0,
      );
      expect(totalFailedTests).toBe(5); // 5 failed tests

      // Verify first failed test has error details
      const firstFileFailures = failedTestFiles[0];
      expect(Array.isArray(firstFileFailures)).toBe(true);
      expect(firstFileFailures.length).toBeGreaterThan(0);
      expect(firstFileFailures[0]).toHaveProperty('testName');
      expect(firstFileFailures[0].testName).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});
