import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleStorage } from '../console-storage.js';
import type { ParsedConsoleEntry } from '../../types/index.js';

describe('ConsoleStorage - Basic Operations', () => {
  let storage: ConsoleStorage;

  beforeEach(() => {
    storage = new ConsoleStorage({
      maxEntries: 100,
      ttl: 60000,
      maxEntriesPerSession: 10,
    });
  });

  describe('add', () => {
    it('should add entries to storage', () => {
      const entry: ParsedConsoleEntry = {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'test message',
      };

      storage.add('session-1', entry);

      const { entries: results } = storage.query('session-1', { sessionId: 'session-1' });
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(entry);
    });

    it('should maintain session isolation', () => {
      const entry1: ParsedConsoleEntry = {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'session 1 message',
      };

      const entry2: ParsedConsoleEntry = {
        id: 2,
        sessionId: 'session-2',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'session 2 message',
      };

      storage.add('session-1', entry1);
      storage.add('session-2', entry2);

      const { entries: session1Results } = storage.query('session-1', {
        sessionId: 'session-1',
      });
      const { entries: session2Results } = storage.query('session-2', {
        sessionId: 'session-2',
      });

      expect(session1Results).toHaveLength(1);
      expect(session1Results[0].message).toBe('session 1 message');

      expect(session2Results).toHaveLength(1);
      expect(session2Results[0].message).toBe('session 2 message');
    });
  });

  describe('getStats', () => {
    it('should return correct stats for session with no entries', () => {
      const stats = storage.getStats('session-1');

      expect(stats).toEqual({
        total: 0,
        byStream: { stdout: 0, stderr: 0 },
      });
    });

    it('should count total entries correctly', () => {
      for (let i = 0; i < 5; i++) {
        storage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: Date.now() + i,
          message: `Message ${i}`,
        });
      }

      const stats = storage.getStats('session-1');

      expect(stats.total).toBe(5);
    });

    it('should count stdout and stderr separately', () => {
      storage.add('session-1', {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Stdout 1',
      });

      storage.add('session-1', {
        id: 2,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now() + 1000,
        message: 'Stdout 2',
      });

      storage.add('session-1', {
        id: 3,
        sessionId: 'session-1',
        type: 'stderr',
        timestamp: Date.now() + 2000,
        message: 'Stderr 1',
      });

      const stats = storage.getStats('session-1');

      expect(stats).toEqual({
        total: 3,
        byStream: { stdout: 2, stderr: 1 },
      });
    });

    it('should only count entries for specified session', () => {
      storage.add('session-1', {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Session 1',
      });

      storage.add('session-2', {
        id: 2,
        sessionId: 'session-2',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Session 2',
      });

      const stats = storage.getStats('session-1');

      expect(stats.total).toBe(1);
    });
  });

  describe('clearSession', () => {
    beforeEach(() => {
      // Add entries to multiple sessions
      for (let i = 0; i < 5; i++) {
        storage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: Date.now() + i,
          message: `Session 1 message ${i}`,
        });
      }

      for (let i = 0; i < 3; i++) {
        storage.add('session-2', {
          id: i + 100,
          sessionId: 'session-2',
          type: 'stdout',
          timestamp: Date.now() + i,
          message: `Session 2 message ${i}`,
        });
      }
    });

    it('should clear all entries for a session', () => {
      storage.clearSession('session-1');

      const { entries: session1Results } = storage.query('session-1', {
        sessionId: 'session-1',
      });
      const { entries: session2Results } = storage.query('session-2', {
        sessionId: 'session-2',
      });

      expect(session1Results).toEqual([]);
      expect(session2Results).toHaveLength(3);
    });

    it('should update stats after clearing session', () => {
      storage.clearSession('session-1');

      const stats = storage.getStats('session-1');

      expect(stats).toEqual({
        total: 0,
        byStream: { stdout: 0, stderr: 0 },
      });
    });

    it('should be safe to clear non-existent session', () => {
      expect(() => storage.clearSession('non-existent')).not.toThrow();
    });

    it('should be safe to clear already cleared session', () => {
      storage.clearSession('session-1');
      expect(() => storage.clearSession('session-1')).not.toThrow();
    });
  });
});
