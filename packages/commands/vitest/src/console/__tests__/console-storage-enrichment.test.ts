import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleStorage } from '../console-storage.js';

describe('ConsoleStorage - Enrichment', () => {
  let storage: ConsoleStorage;

  beforeEach(() => {
    storage = new ConsoleStorage({
      maxEntries: 100,
      ttl: 60000,
      maxEntriesPerSession: 50,
    });
  });

  describe('enrichEntriesForTask', () => {
    it('should enrich console entries with test context retroactively', () => {
      const sessionId = 'test-session';
      const taskId = 'task-123';

      // Add entries without test context (simulating during-test logging)
      storage.add(sessionId, {
        id: 1,
        sessionId,
        taskId,
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Console log during test',
      });

      storage.add(sessionId, {
        id: 2,
        sessionId,
        taskId,
        type: 'stderr',
        timestamp: Date.now() + 1000,
        message: 'Console error during test',
      });

      // Verify entries don't have test context yet
      let { entries } = storage.query(sessionId, { sessionId, taskId });
      expect(entries).toHaveLength(2);
      expect(entries[0].testId).toBeUndefined();
      expect(entries[0].testName).toBeUndefined();
      expect(entries[0].testFile).toBeUndefined();

      // Enrich entries with test context (simulating post-test enrichment)
      storage.enrichEntriesForTask(
        sessionId,
        taskId,
        'test-id-123',
        'should authenticate user',
        '/tests/auth.test.ts',
      );

      // Verify entries now have test context
      ({ entries } = storage.query(sessionId, { sessionId, taskId }));
      expect(entries).toHaveLength(2);
      expect(entries[0].testId).toBe('test-id-123');
      expect(entries[0].testName).toBe('should authenticate user');
      expect(entries[0].testFile).toBe('/tests/auth.test.ts');
      expect(entries[1].testId).toBe('test-id-123');
      expect(entries[1].testName).toBe('should authenticate user');
      expect(entries[1].testFile).toBe('/tests/auth.test.ts');
    });

    it('should only enrich entries matching the taskId', () => {
      const sessionId = 'test-session';

      // Add entries for different tasks
      storage.add(sessionId, {
        id: 1,
        sessionId,
        taskId: 'task-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Task 1 log',
      });

      storage.add(sessionId, {
        id: 2,
        sessionId,
        taskId: 'task-2',
        type: 'stdout',
        timestamp: Date.now() + 1000,
        message: 'Task 2 log',
      });

      // Enrich only task-1 entries
      storage.enrichEntriesForTask(
        sessionId,
        'task-1',
        'test-1',
        'Test 1',
        '/test1.ts',
      );

      // Verify only task-1 entries are enriched
      const { entries: task1Entries } = storage.query(sessionId, {
        sessionId,
        taskId: 'task-1',
      });
      expect(task1Entries).toHaveLength(1);
      expect(task1Entries[0].testId).toBe('test-1');
      expect(task1Entries[0].testName).toBe('Test 1');

      const { entries: task2Entries } = storage.query(sessionId, {
        sessionId,
        taskId: 'task-2',
      });
      expect(task2Entries).toHaveLength(1);
      expect(task2Entries[0].testId).toBeUndefined();
      expect(task2Entries[0].testName).toBeUndefined();
    });

    it('should allow filtering by testName after enrichment', () => {
      const sessionId = 'test-session';

      // Add entries for different tasks
      storage.add(sessionId, {
        id: 1,
        sessionId,
        taskId: 'task-1',
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Auth test log',
      });

      storage.add(sessionId, {
        id: 2,
        sessionId,
        taskId: 'task-2',
        type: 'stdout',
        timestamp: Date.now() + 1000,
        message: 'API test log',
      });

      // Enrich with different test contexts
      storage.enrichEntriesForTask(
        sessionId,
        'task-1',
        'test-1',
        'should authenticate user',
        '/tests/auth.test.ts',
      );

      storage.enrichEntriesForTask(
        sessionId,
        'task-2',
        'test-2',
        'should fetch data from API',
        '/tests/api.test.ts',
      );

      // Filter by testName
      const { entries: authEntries } = storage.query(sessionId, {
        sessionId,
        testName: 'authenticate',
      });

      expect(authEntries).toHaveLength(1);
      expect(authEntries[0].testName).toBe('should authenticate user');
      expect(authEntries[0].message).toBe('Auth test log');

      // Filter by testFile
      const { entries: apiEntries } = storage.query(sessionId, {
        sessionId,
        testFile: 'api.test',
      });

      expect(apiEntries).toHaveLength(1);
      expect(apiEntries[0].testName).toBe('should fetch data from API');
      expect(apiEntries[0].message).toBe('API test log');
    });

    it('should handle entries without taskId gracefully', () => {
      const sessionId = 'test-session';

      // Add entry without taskId
      storage.add(sessionId, {
        id: 1,
        sessionId,
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Global log',
      });

      // Try to enrich with a taskId
      storage.enrichEntriesForTask(
        sessionId,
        'task-1',
        'test-1',
        'Test 1',
        '/test1.ts',
      );

      // Entry without taskId should not be enriched
      const { entries } = storage.query(sessionId, { sessionId });
      expect(entries).toHaveLength(1);
      expect(entries[0].testId).toBeUndefined();
      expect(entries[0].testName).toBeUndefined();
      expect(entries[0].testFile).toBeUndefined();
    });

    it('should not affect entries from different sessions', () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';
      const taskId = 'task-1';

      // Add entries to both sessions
      storage.add(sessionId1, {
        id: 1,
        sessionId: sessionId1,
        taskId,
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Session 1 log',
      });

      storage.add(sessionId2, {
        id: 2,
        sessionId: sessionId2,
        taskId,
        type: 'stdout',
        timestamp: Date.now(),
        message: 'Session 2 log',
      });

      // Enrich only session-1
      storage.enrichEntriesForTask(
        sessionId1,
        taskId,
        'test-1',
        'Test 1',
        '/test1.ts',
      );

      // Verify only session-1 entries are enriched
      const { entries: session1Entries } = storage.query(sessionId1, {
        sessionId: sessionId1,
      });
      expect(session1Entries).toHaveLength(1);
      expect(session1Entries[0].testId).toBe('test-1');

      const { entries: session2Entries } = storage.query(sessionId2, {
        sessionId: sessionId2,
      });
      expect(session2Entries).toHaveLength(1);
      expect(session2Entries[0].testId).toBeUndefined();
    });
  });
});
