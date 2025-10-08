import { describe, it, expect } from 'vitest';
import { VitestSessionManager } from '../session-manager.js';
import { createVitestFixture } from '../../../test/utils.js';

describe('VitestSessionManager - Edge Cases', () => {
  it('should handle session with mixed test results', async () => {
    // failing-tests has mix of passed, failed, and skipped tests
    const { manager, sessionId, cleanup } = await createVitestFixture('failing-tests');

    try {
      const status = manager.getSessionStatus(sessionId);

      expect(status.status).toBe('completed');

      // Verify all result types are captured
      expect(status.summary).toBeDefined();
      expect(status.summary?.total).toBe(7);
      expect(status.summary?.passed).toBe(1);
      expect(status.summary?.skipped).toBe(1);

      // Get detailed results
      const results = manager.getResults({ sessionId });

      expect(results.summary).toBeDefined();
      expect(results.summary.failed).toBeDefined();

      // Verify failed tests have errors
      const failedTests = Object.values(results.summary.failed).flat();
      expect(failedTests.length).toBe(5); // 5 failed tests total

      for (const failure of failedTests) {
        expect(failure).toHaveProperty('testName');
        expect(failure.testName).toBeTruthy();
      }
    } finally {
      await cleanup();
    }
  });

  it('should handle invalid sessionId format gracefully', () => {
    const manager = new VitestSessionManager();

    try {
      expect(() => {
        manager.getSessionStatus('invalid-format');
      }).toThrow('Session not found: invalid-format');
    } finally {
      manager.destroy();
    }
  });
});
