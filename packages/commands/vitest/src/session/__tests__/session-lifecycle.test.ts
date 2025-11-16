import { describe, it, expect } from 'vitest';
import { VitestSessionManager } from '../session-manager.js';
import { createVitestFixture } from '../../../test/utils.js';

describe('VitestSessionManager - Session Lifecycle', () => {
  it('should start a session and return results with basic-project', async () => {
    const { manager, sessionId, cleanup } = await createVitestFixture('basic-project');

    try {
      // Verify session was created
      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^[a-f0-9-]{36}$/); // UUID format

      // Get session status
      const status = manager.getSessionStatus(sessionId);

      expect(status.id).toBe(sessionId);
      expect(status.status).toBe('completed');
      expect(status.config).toBeDefined();
      expect(status.startedAt).toBeDefined();
      expect(status.completedAt).toBeDefined();

      // basic-project has 6 passing tests
      expect(status.summary).toBeDefined();
      expect(status.summary?.total).toBe(6);
      expect(status.summary?.passed).toBe(6);
      expect(status.summary?.skipped).toBe(0);
      expect(Object.keys(status.summary?.failed || {})).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('should return session status for completed session', async () => {
    const { manager, sessionId, cleanup } = await createVitestFixture('basic-project');

    try {
      const status = manager.getSessionStatus(sessionId);

      expect(status).toMatchObject({
        id: sessionId,
        status: 'completed',
      });
      expect(status.startedAt).toBeDefined();
      expect(status.completedAt).toBeDefined();
      expect(status.summary).toBeDefined();
      expect(status.config.root).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it('should throw error for non-existent session', () => {
    const manager = new VitestSessionManager();

    try {
      expect(() => {
        manager.getSessionStatus('non-existent-session-id');
      }).toThrow('Session not found: non-existent-session-id');
    } finally {
      manager.destroy();
    }
  });
});
