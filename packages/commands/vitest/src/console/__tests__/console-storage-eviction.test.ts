import { describe, it, expect } from 'vitest';
import { ConsoleStorage } from '../console-storage.js';
import type { ParsedConsoleEntry } from '../../types/index.js';

describe('ConsoleStorage - Eviction', () => {
  describe('per-session limits', () => {
    it('should enforce per-session limits by evicting oldest entries', () => {
      const storage = new ConsoleStorage({
        maxEntries: 100,
        ttl: 60000,
        maxEntriesPerSession: 10,
      });

      const baseTimestamp = Date.now();

      // Add maxEntriesPerSession + 2 entries
      for (let i = 0; i < 12; i++) {
        const entry: ParsedConsoleEntry = {
          id: i,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + i,
          message: `message ${i}`,
        };
        storage.add('session-1', entry);
      }

      const { entries: results } = storage.query('session-1', { sessionId: 'session-1' });

      // Should only have maxEntriesPerSession (10) entries
      expect(results).toHaveLength(10);

      // First two entries (0, 1) should be evicted, so results should start from id 2
      expect(results[0].id).toBe(2);
      expect(results[results.length - 1].id).toBe(11);
    });

    it('should respect per-session limits independently for different sessions', () => {
      const storage = new ConsoleStorage({
        maxEntries: 100,
        ttl: 60000,
        maxEntriesPerSession: 10,
      });

      const baseTimestamp = Date.now();

      // Add 12 entries to session-1
      for (let i = 0; i < 12; i++) {
        storage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + i,
          message: `session-1 message ${i}`,
        });
      }

      // Add 5 entries to session-2
      for (let i = 0; i < 5; i++) {
        storage.add('session-2', {
          id: i + 100,
          sessionId: 'session-2',
          type: 'stdout',
          timestamp: baseTimestamp + i,
          message: `session-2 message ${i}`,
        });
      }

      const { entries: session1Results } = storage.query('session-1', { sessionId: 'session-1' });
      const { entries: session2Results } = storage.query('session-2', { sessionId: 'session-2' });

      expect(session1Results).toHaveLength(10);
      expect(session2Results).toHaveLength(5);
    });

    it('should handle multiple evictions when adding many entries beyond limit', () => {
      const storage = new ConsoleStorage({
        maxEntries: 200,
        ttl: 60000,
        maxEntriesPerSession: 10,
      });

      const baseTimestamp = Date.now();

      // Add 100 entries (far exceeding the limit of 10)
      for (let i = 0; i < 100; i++) {
        storage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + i,
          message: `message ${i}`,
        });
      }

      const { entries: results } = storage.query('session-1', { sessionId: 'session-1' });

      // Should only have maxEntriesPerSession (10) entries
      expect(results).toHaveLength(10);

      // Should have the last 10 entries (90-99)
      expect(results[0].id).toBe(90);
      expect(results[9].id).toBe(99);

      // Verify stats also reflect the correct count
      const stats = storage.getStats('session-1');
      expect(stats.total).toBe(10);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when max capacity is reached', () => {
      const smallStorage = new ConsoleStorage({
        maxEntries: 5,
        ttl: 60000,
        maxEntriesPerSession: 100, // High limit so per-session doesn't interfere
      });

      const baseTimestamp = Date.now();

      // Add 7 entries (exceeds maxEntries of 5)
      for (let i = 0; i < 7; i++) {
        smallStorage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + i,
          message: `Message ${i}`,
        });
      }

      const { entries: results } = smallStorage.query('session-1', { sessionId: 'session-1' });

      // Should only have 5 entries
      expect(results).toHaveLength(5);

      // Should have entries 2-6 (0 and 1 were evicted)
      expect(results[0].id).toBe(2);
      expect(results[4].id).toBe(6);
    });

    it('should handle LRU eviction across multiple sessions', () => {
      const smallStorage = new ConsoleStorage({
        maxEntries: 10,
        ttl: 60000,
        maxEntriesPerSession: 100,
      });

      const baseTimestamp = Date.now();

      // Add 6 entries to session-1
      for (let i = 0; i < 6; i++) {
        smallStorage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + i,
          message: `Session 1 message ${i}`,
        });
      }

      // Add 6 entries to session-2 (should trigger LRU eviction)
      for (let i = 0; i < 6; i++) {
        smallStorage.add('session-2', {
          id: i + 100,
          sessionId: 'session-2',
          type: 'stdout',
          timestamp: baseTimestamp + i + 100,
          message: `Session 2 message ${i}`,
        });
      }

      const { entries: session1Results } = smallStorage.query('session-1', {
        sessionId: 'session-1',
      });
      const { entries: session2Results } = smallStorage.query('session-2', {
        sessionId: 'session-2',
      });

      // Total should be 10, with oldest entries from session-1 evicted
      expect(session1Results.length + session2Results.length).toBe(10);

      // Session-1 should have lost 2 entries
      expect(session1Results).toHaveLength(4);
      expect(session1Results[0].id).toBe(2);

      // Session-2 should have all 6 entries
      expect(session2Results).toHaveLength(6);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlStorage = new ConsoleStorage({
        maxEntries: 100,
        ttl: 100, // 100ms TTL for quick test
        maxEntriesPerSession: 100,
      });

      const entry: ParsedConsoleEntry = {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Test message',
      };

      shortTtlStorage.add('session-1', entry);

      // Entry should exist immediately
      let { entries: results } = shortTtlStorage.query('session-1', {
        sessionId: 'session-1',
      });
      expect(results).toHaveLength(1);

      // Wait for TTL to expire (add buffer time for autopurge)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Entry should be expired
      ({ entries: results } = shortTtlStorage.query('session-1', { sessionId: 'session-1' }));
      expect(results).toHaveLength(0);
    });

    it('should update stats after TTL expiration', async () => {
      const shortTtlStorage = new ConsoleStorage({
        maxEntries: 100,
        ttl: 100,
        maxEntriesPerSession: 100,
      });

      shortTtlStorage.add('session-1', {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Test',
      });

      let stats = shortTtlStorage.getStats('session-1');
      expect(stats.total).toBe(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      stats = shortTtlStorage.getStats('session-1');
      expect(stats.total).toBe(0);
    });

    it('should not expire entries before TTL', async () => {
      const shortTtlStorage = new ConsoleStorage({
        maxEntries: 100,
        ttl: 200,
        maxEntriesPerSession: 100,
      });

      shortTtlStorage.add('session-1', {
        id: 1,
        sessionId: 'session-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Test',
      });

      // Wait less than TTL
      await new Promise((resolve) => setTimeout(resolve, 50));

      const { entries: results } = shortTtlStorage.query('session-1', { sessionId: 'session-1' });
      expect(results).toHaveLength(1);
    });
  });
});
