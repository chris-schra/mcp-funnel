import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleStorage } from '../console-storage.js';
import type { ParsedConsoleEntry } from '../../types/index.js';

describe('ConsoleStorage - Edge Cases', () => {
  let storage: ConsoleStorage;

  beforeEach(() => {
    storage = new ConsoleStorage({
      maxEntries: 100,
      ttl: 60000,
      maxEntriesPerSession: 50,
    });
  });

  describe('sorting', () => {
    it('should sort results by timestamp ascending', () => {
      const baseTimestamp = Date.now();

      // Add entries in non-chronological order
      storage.add('session-1', {
        id: 2,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: baseTimestamp + 2000,
        message: 'Third',
      });

      storage.add('session-1', {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: baseTimestamp,
        message: 'First',
      });

      storage.add('session-1', {
        id: 3,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: baseTimestamp + 1000,
        message: 'Second',
      });

      const { entries: results } = storage.query('session-1', { sessionId: 'session-1' });

      expect(results).toHaveLength(3);
      expect(results[0].message).toBe('First');
      expect(results[1].message).toBe('Second');
      expect(results[2].message).toBe('Third');
    });
  });

  describe('query edge cases', () => {
    it('should return empty array when no entries exist', () => {
      const { entries: results } = storage.query('session-1', { sessionId: 'session-1' });

      expect(results).toEqual([]);
    });

    it('should return empty array when no entries match filters', () => {
      storage.add('session-1', {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Test message',
      });

      const { entries: results } = storage.query('session-1', {
        sessionId: 'session-1',
        taskId: 'non-existent-task',
      });

      expect(results).toEqual([]);
    });

    it('should not return entries from other sessions', () => {
      storage.add('session-1', {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Session 1 message',
      });

      const { entries: results } = storage.query('session-2', { sessionId: 'session-2' });

      expect(results).toEqual([]);
    });

    it('should handle entries without optional fields', () => {
      const entry: ParsedConsoleEntry = {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Minimal entry',
      };

      storage.add('session-1', entry);

      const { entries: results } = storage.query('session-1', {
        sessionId: 'session-1',
        testFile: 'some-file',
      });

      // Should not match since entry has no testFile
      expect(results).toEqual([]);
    });
  });

  describe('complex scenarios', () => {
    it('should handle combination of filters, pagination, and sorting', () => {
      const baseTimestamp = Date.now();

      // Add 20 mixed entries
      for (let i = 0; i < 20; i++) {
        storage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: i % 3 === 0 ? 'stderr' : 'stdout',
          timestamp: baseTimestamp + i * 1000,
          message: `Message ${i} - ${i % 2 === 0 ? 'ERROR' : 'INFO'}`,
          taskId: `task-${i % 3}`,
        });
      }

      const { entries: results } = storage.query('session-1', {
        sessionId: 'session-1',
        streamType: 'stdout',
        search: 'ERROR',
        skip: 2,
        limit: 5,
      });

      // Should be sorted by timestamp
      for (let i = 1; i < results.length; i++) {
        expect(results[i].timestamp).toBeGreaterThan(results[i - 1].timestamp);
      }

      // All should be stdout
      expect(results.every((r) => r.type === 'stdout')).toBe(true);

      // All should contain 'ERROR'
      expect(results.every((r) => r.message.includes('ERROR'))).toBe(true);
    });

    it('should maintain integrity after multiple operations', () => {
      const baseTimestamp = Date.now();

      // Add entries
      for (let i = 0; i < 5; i++) {
        storage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + i,
          message: `Message ${i}`,
        });
      }

      // Query
      let { entries: results } = storage.query('session-1', { sessionId: 'session-1' });
      expect(results).toHaveLength(5);

      // Add more entries
      for (let i = 5; i < 10; i++) {
        storage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: 'stderr',
          timestamp: baseTimestamp + i,
          message: `Message ${i}`,
        });
      }

      // Query again
      ({ entries: results } = storage.query('session-1', { sessionId: 'session-1' }));
      expect(results).toHaveLength(10);

      // Get stats
      const stats = storage.getStats('session-1');
      expect(stats).toEqual({
        total: 10,
        byStream: { stdout: 5, stderr: 5 },
      });

      // Clear session
      storage.clearSession('session-1');

      // Verify cleared
      ({ entries: results } = storage.query('session-1', { sessionId: 'session-1' }));
      expect(results).toEqual([]);
    });

    it('should handle rapid additions and queries', () => {
      const baseTimestamp = Date.now();

      // Rapidly add entries
      for (let i = 0; i < 100; i++) {
        storage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: i % 2 === 0 ? 'stdout' : 'stderr',
          timestamp: baseTimestamp + i,
          message: `Rapid message ${i}`,
          taskId: `task-${i % 5}`,
        });
      }

      // Query with various filters should still work
      const { entries: stdoutResults } = storage.query('session-1', {
        sessionId: 'session-1',
        streamType: 'stdout',
      });

      const { entries: stderrResults } = storage.query('session-1', {
        sessionId: 'session-1',
        streamType: 'stderr',
      });

      const { entries: task0Results } = storage.query('session-1', {
        sessionId: 'session-1',
        taskId: 'task-0',
      });

      // Should only have maxEntriesPerSession (50) total entries
      const { entries: allResults } = storage.query('session-1', { sessionId: 'session-1' });
      expect(allResults).toHaveLength(50);

      // Stdout and stderr should add up to total
      expect(stdoutResults.length + stderrResults.length).toBe(allResults.length);

      // Task-specific queries should work
      expect(task0Results.length).toBeGreaterThan(0);
      expect(task0Results.every((r) => r.taskId === 'task-0')).toBe(true);
    });

    it('should handle concurrent sessions with mixed operations', () => {
      const sessions = ['session-1', 'session-2', 'session-3'];
      const baseTimestamp = Date.now();

      // Add entries to multiple sessions
      sessions.forEach((sessionId, sessionIndex) => {
        for (let i = 0; i < 10; i++) {
          storage.add(sessionId, {
            id: sessionIndex * 100 + i,
            sessionId,
            type: i % 2 === 0 ? 'stdout' : 'stderr',
            timestamp: baseTimestamp + i,
            message: `${sessionId} message ${i}`,
          });
        }
      });

      // Verify each session has correct entries
      sessions.forEach((sessionId) => {
        const { entries: results } = storage.query(sessionId, { sessionId });
        expect(results).toHaveLength(10);
        expect(results.every((r) => r.sessionId === sessionId)).toBe(true);
      });

      // Clear one session shouldn't affect others
      storage.clearSession('session-2');

      const { entries: session1Results } = storage.query('session-1', { sessionId: 'session-1' });
      const { entries: session2Results } = storage.query('session-2', { sessionId: 'session-2' });
      const { entries: session3Results } = storage.query('session-3', { sessionId: 'session-3' });

      expect(session1Results).toHaveLength(10);
      expect(session2Results).toHaveLength(0);
      expect(session3Results).toHaveLength(10);

      // Stats should reflect cleared session
      const session2Stats = storage.getStats('session-2');
      expect(session2Stats).toEqual({
        total: 0,
        byStream: { stdout: 0, stderr: 0 },
      });
    });
  });
});
