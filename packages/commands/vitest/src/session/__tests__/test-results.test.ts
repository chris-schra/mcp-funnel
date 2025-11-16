import { describe, it, expect } from 'vitest';
import { VitestSessionManager } from '../session-manager.js';
import { createVitestFixture } from '../../../test/utils.js';

describe('VitestSessionManager - Test Results', () => {
  it('should return summary-only when no filters are provided', async () => {
    const { manager, sessionId, cleanup } = await createVitestFixture('basic-project');

    try {
      const results = manager.getResults({ sessionId });

      expect(results.sessionId).toBe(sessionId);
      expect(results.summary).toBeDefined();

      // basic-project has 6 passing tests
      expect(results.summary.total).toBe(6);
      expect(results.summary.passed).toBe(6);
      expect(results.summary.skipped).toBe(0);
      expect(Object.keys(results.summary.failed)).toHaveLength(0);

      // No filters provided, so no queryResults
      expect(results.queryResults).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it('should return queryResults when filters are provided', async () => {
    const { manager, sessionId, cleanup } = await createVitestFixture('basic-project');

    try {
      // Use a test name pattern to trigger queryResults
      const results = manager.getResults({
        sessionId,
        testName: 'should add',
      });

      expect(results.sessionId).toBe(sessionId);
      expect(results.summary).toBeDefined();
      expect(results.queryResults).toBeDefined();
      expect(results.queryResults?.files).toBeDefined();

      // Verify we have file results
      const fileCount = Object.keys(results.queryResults?.files || {}).length;
      expect(fileCount).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });

  it('should throw error for non-existent session when getting results', () => {
    const manager = new VitestSessionManager();

    try {
      expect(() => {
        manager.getResults({ sessionId: 'non-existent-session-id' });
      }).toThrow('Session not found: non-existent-session-id');
    } finally {
      manager.destroy();
    }
  });
});
