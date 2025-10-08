import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleStorage } from '../console-storage.js';
import type { ParsedConsoleEntry } from '../../types/index.js';

describe('ConsoleStorage - Filtering', () => {
  let storage: ConsoleStorage;

  beforeEach(() => {
    storage = new ConsoleStorage({
      maxEntries: 100,
      ttl: 60000,
      maxEntriesPerSession: 50,
    });
  });

  describe('stream type filtering', () => {
    beforeEach(() => {
      const baseTimestamp = Date.now();

      const entries: ParsedConsoleEntry[] = [
        {
          id: 1,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp,
          message: 'Starting test suite',
          taskId: 'task-1',
          testFile: '/tests/unit/auth.test.ts',
          testName: 'should authenticate user',
        },
        {
          id: 2,
          sessionId: 'session-1',
          type: 'stderr',
          timestamp: baseTimestamp + 1000,
          message: 'Error: Connection timeout',
          taskId: 'task-1',
          testFile: '/tests/unit/auth.test.ts',
          testName: 'should authenticate user',
        },
        {
          id: 3,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + 2000,
          message: 'Test completed successfully',
          taskId: 'task-2',
          testFile: '/tests/integration/api.test.ts',
          testName: 'should fetch data from API',
        },
        {
          id: 4,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + 3000,
          message: 'Cleaning up resources',
          taskId: 'task-2',
          testFile: '/tests/integration/api.test.ts',
          testName: 'should fetch data from API',
        },
      ];

      entries.forEach((entry) => storage.add(entry.sessionId, entry));
    });

    it('should filter by stream type (stdout)', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        streamType: 'stdout',
      });

      expect(entries).toHaveLength(3);
      expect(entries.every((r) => r.type === 'stdout')).toBe(true);
    });

    it('should filter by stream type (stderr)', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        streamType: 'stderr',
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Error: Connection timeout');
    });

    it('should return all types when streamType is "both"', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        streamType: 'both',
      });

      expect(entries).toHaveLength(4);
    });

    it('should filter by taskId', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        taskId: 'task-1',
      });

      expect(entries).toHaveLength(2);
      expect(entries.every((r) => r.taskId === 'task-1')).toBe(true);
    });

    it('should filter by testFile (substring match)', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        testFile: 'auth.test',
      });

      expect(entries).toHaveLength(2);
      expect(entries.every((r) => r.testFile?.includes('auth.test'))).toBe(true);
    });

    it('should filter by testName (substring match)', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        testName: 'authenticate',
      });

      expect(entries).toHaveLength(2);
      expect(entries.every((r) => r.testName?.includes('authenticate'))).toBe(true);
    });

    it('should combine multiple filters (AND logic)', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        taskId: 'task-1',
        streamType: 'stderr',
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Error: Connection timeout');
    });
  });

  describe('search functionality', () => {
    beforeEach(() => {
      const entries: ParsedConsoleEntry[] = [
        {
          id: 1,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: Date.now(),
          message: 'The quick brown fox jumps',
        },
        {
          id: 2,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: Date.now() + 1000,
          message: 'ERROR: File not found',
        },
        {
          id: 3,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: Date.now() + 2000,
          message: 'Test 123: Starting validation',
        },
      ];

      entries.forEach((entry) => storage.add(entry.sessionId, entry));
    });

    it('should search with literal text (case insensitive by default)', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        search: 'error',
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('ERROR: File not found');
    });

    it('should search with literal text (case sensitive)', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        search: 'ERROR',
        caseSensitive: true,
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('ERROR: File not found');
    });

    it('should not match when case sensitive search does not match', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        search: 'error',
        caseSensitive: true,
      });

      expect(entries).toHaveLength(0);
    });

    it('should search with regex (case insensitive)', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        search: 'test \\d+',
        useRegex: true,
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Test 123: Starting validation');
    });

    it('should search with regex (case sensitive)', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        search: 'Test \\d+',
        useRegex: true,
        caseSensitive: true,
      });

      expect(entries).toHaveLength(1);
    });

    it('should fall back to literal search on invalid regex', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        search: '[invalid(regex',
        useRegex: true,
      });

      // Should not throw error, but fall back to literal search
      expect(entries).toHaveLength(0);
    });

    it('should match complex regex patterns', () => {
      const { entries } = storage.query('session-1', {
        sessionId: 'session-1',
        search: '^The.*fox',
        useRegex: true,
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('The quick brown fox jumps');
    });
  });

  describe('time range filtering', () => {
    let baseTimestamp: number;

    beforeEach(() => {
      baseTimestamp = Date.now();

      const entries: ParsedConsoleEntry[] = [
        {
          id: 1,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp,
          message: 'Entry 1',
        },
        {
          id: 2,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + 5000,
          message: 'Entry 2',
        },
        {
          id: 3,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: baseTimestamp + 10000,
          message: 'Entry 3',
        },
      ];

      entries.forEach((entry) => storage.add(entry.sessionId, entry));
    });

    it('should filter by after timestamp', () => {
      const { entries: results } = storage.query('session-1', {
        sessionId: 'session-1',
        after: baseTimestamp + 3000,
      });

      expect(results).toHaveLength(2);
      expect(results[0].message).toBe('Entry 2');
      expect(results[1].message).toBe('Entry 3');
    });

    it('should filter by before timestamp', () => {
      const { entries: results } = storage.query('session-1', {
        sessionId: 'session-1',
        before: baseTimestamp + 7000,
      });

      expect(results).toHaveLength(2);
      expect(results[0].message).toBe('Entry 1');
      expect(results[1].message).toBe('Entry 2');
    });

    it('should filter by time range (after and before)', () => {
      const { entries: results } = storage.query('session-1', {
        sessionId: 'session-1',
        after: baseTimestamp + 3000,
        before: baseTimestamp + 7000,
      });

      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('Entry 2');
    });
  });

  describe('pagination', () => {
    let paginationStorage: ConsoleStorage;

    beforeEach(() => {
      paginationStorage = new ConsoleStorage({
        maxEntries: 100,
        ttl: 60000,
        maxEntriesPerSession: 50,
      });

      for (let i = 0; i < 20; i++) {
        paginationStorage.add('session-1', {
          id: i,
          sessionId: 'session-1',
          type: 'stdout',
          timestamp: Date.now() + i,
          message: `Message ${i}`,
        });
      }
    });

    it('should limit results', () => {
      const { entries: results } = paginationStorage.query('session-1', {
        sessionId: 'session-1',
        limit: 5,
      });

      expect(results).toHaveLength(5);
      expect(results[0].id).toBe(0);
      expect(results[4].id).toBe(4);
    });

    it('should skip results', () => {
      const { entries: results } = paginationStorage.query('session-1', {
        sessionId: 'session-1',
        skip: 10,
      });

      expect(results).toHaveLength(10);
      expect(results[0].id).toBe(10);
      expect(results[9].id).toBe(19);
    });

    it('should combine skip and limit', () => {
      const { entries: results } = paginationStorage.query('session-1', {
        sessionId: 'session-1',
        skip: 5,
        limit: 10,
      });

      expect(results).toHaveLength(10);
      expect(results[0].id).toBe(5);
      expect(results[9].id).toBe(14);
    });
  });
});
