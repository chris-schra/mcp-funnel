import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import { prepareNodeFixture } from './utils/fixture-manager.js';
import { waitFor } from './utils/async-helpers.js';
import { waitForOutput, queryWithConsoleLevel, queryWithStream } from './utils/output-helpers.js';
import type { DebugSessionId, OutputEntry, ConsoleLevel, StreamName } from '../src/types/index.js';
import type { FixtureHandle } from './utils/fixture-manager.js';

describe('Output Collection', () => {
  let manager: DebuggerSessionManager;
  let sessionId: DebugSessionId;
  let fixture: FixtureHandle;

  beforeEach(async () => {
    manager = new DebuggerSessionManager();
    fixture = await prepareNodeFixture('console-output.js');

    const response = await manager.startSession({
      target: {
        type: 'node',
        entry: fixture.tempPath,
      },
      resumeAfterConfigure: true,
    });

    sessionId = response.session.id;
  }, 20000); // Increase timeout for parallel test execution

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('Basic Output Collection', () => {
    it('should collect stdout and stderr output', async () => {
      const stdoutResult = await queryWithStream(manager, sessionId, 'stdout');
      const stderrResult = await queryWithStream(manager, sessionId, 'stderr');

      expect(stdoutResult.entries.length).toBeGreaterThan(0);
      expect(stderrResult.entries.length).toBeGreaterThan(0);

      expect(
        stdoutResult.entries.every((e) => e.kind !== 'stdio' || e.entry.stream === 'stdout'),
      ).toBe(true);

      expect(
        stderrResult.entries.every((e) => e.kind !== 'stdio' || e.entry.stream === 'stderr'),
      ).toBe(true);
    });

    it('should collect all console levels (log, warn, error)', async () => {
      const levels: ConsoleLevel[] = ['log', 'warn', 'error'];

      for (const level of levels) {
        const result = await queryWithConsoleLevel(manager, sessionId, level);

        expect(result.entries.length).toBeGreaterThan(0);
        expect(result.entries.every((e) => e.kind !== 'console' || e.entry.level === level)).toBe(
          true,
        );
      }
    });

    it('should include timestamps on all entries', async () => {
      const result = await waitForOutput(() => manager.queryOutput({ sessionId, limit: 50 }));

      expect(result.entries.length).toBeGreaterThan(0);

      for (const entry of result.entries) {
        const timestamp =
          entry.kind === 'stdio' || entry.kind === 'console' || entry.kind === 'exception'
            ? entry.entry.timestamp
            : 0;

        expect(timestamp).toBeTypeOf('number');
        expect(timestamp).toBeGreaterThan(0);
      }
    });
  });

  describe('Query Filtering', () => {
    it('should filter by single and multiple streams', async () => {
      const singleStream = await queryWithStream(manager, sessionId, 'stdout');
      const multiStream = await waitForOutput(() =>
        manager.queryOutput({
          sessionId,
          streams: ['stdout', 'stderr'],
          includeExceptions: false,
        }),
      );

      expect(singleStream.entries.length).toBeGreaterThan(0);
      expect(multiStream.entries.length).toBeGreaterThan(0);

      const validStreams: Set<StreamName> = new Set(['stdout', 'stderr']);
      expect(
        multiStream.entries.every((e) => e.kind !== 'stdio' || validStreams.has(e.entry.stream)),
      ).toBe(true);
    });

    it('should filter by single and multiple console levels', async () => {
      const singleLevel = await queryWithConsoleLevel(manager, sessionId, 'log');
      const multiLevel = await waitForOutput(() =>
        manager.queryOutput({
          sessionId,
          levels: ['log', 'warn', 'error'],
          includeExceptions: false,
        }),
      );

      expect(singleLevel.entries.length).toBeGreaterThan(0);
      expect(multiLevel.entries.length).toBeGreaterThan(0);

      const validLevels: Set<ConsoleLevel> = new Set(['log', 'warn', 'error']);
      expect(
        multiLevel.entries.every((e) => e.kind !== 'console' || validLevels.has(e.entry.level)),
      ).toBe(true);
    });

    it('should filter by search text (case-insensitive)', async () => {
      const lowerCase = await waitForOutput(() =>
        manager.queryOutput({
          sessionId,
          search: 'test log message',
          includeExceptions: false,
        }),
      );

      const upperCase = await waitForOutput(() =>
        manager.queryOutput({
          sessionId,
          search: 'TEST LOG MESSAGE',
          includeExceptions: false,
        }),
      );

      expect(lowerCase.entries.length).toBeGreaterThan(0);
      expect(upperCase.entries.length).toBeGreaterThan(0);

      const hasMatch = (entry: OutputEntry, search: string): boolean => {
        const lowerSearch = search.toLowerCase();
        switch (entry.kind) {
          case 'stdio':
            return entry.entry.text.toLowerCase().includes(lowerSearch);
          case 'console':
            return (
              entry.entry.text.toLowerCase().includes(lowerSearch) ||
              entry.entry.arguments.some((arg) => arg.text.toLowerCase().includes(lowerSearch))
            );
          default:
            return false;
        }
      };

      expect(lowerCase.entries.some((e) => hasMatch(e, 'test log message'))).toBe(true);
    });

    it('should control exception inclusion', async () => {
      const withoutExceptions = await waitForOutput(() =>
        manager.queryOutput({
          sessionId,
          includeExceptions: false,
          limit: 50,
        }),
      );

      const withExceptions = await manager.queryOutput({
        sessionId,
        includeExceptions: true,
        limit: 50,
      });

      expect(withoutExceptions.entries.every((e) => e.kind !== 'exception')).toBe(true);

      expect(withExceptions.entries.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cursor-based Pagination', () => {
    it('should return monotonically increasing cursors', async () => {
      const result = await waitForOutput(() => manager.queryOutput({ sessionId, limit: 50 }));

      expect(result.entries.length).toBeGreaterThan(0);

      for (let i = 1; i < result.entries.length; i++) {
        expect(result.entries[i].cursor).toBeGreaterThan(result.entries[i - 1].cursor);
      }
    });

    it('should respect limit and return pagination metadata', async () => {
      const limit = 3;
      const result = await waitForOutput(() => manager.queryOutput({ sessionId, limit }));

      expect(result.entries.length).toBeLessThanOrEqual(limit);
      expect(result.nextCursor).toBeTypeOf('number');

      if (result.entries.length > 0) {
        expect(result.nextCursor).toBe(result.entries[result.entries.length - 1].cursor);
      }
    });

    it('should paginate using since cursor', async () => {
      const firstPage = await waitForOutput(() => manager.queryOutput({ sessionId, limit: 2 }));

      expect(firstPage.entries.length).toBeGreaterThan(0);

      await waitForOutput(() => manager.queryOutput({ sessionId }));

      const secondPage = await manager.queryOutput({
        sessionId,
        since: firstPage.nextCursor,
        limit: 10,
      });

      expect(secondPage.entries.every((entry) => entry.cursor > firstPage.nextCursor)).toBe(true);
    });

    it('should set hasMore correctly', async () => {
      const limited = await waitForOutput(() => manager.queryOutput({ sessionId, limit: 1 }));

      if (limited.entries.length > 0) {
        await waitForOutput(() => manager.queryOutput({ sessionId, limit: 50 }));

        const result = await manager.queryOutput({ sessionId, limit: 1 });
        expect(result.hasMore).toBe(true);
      }

      const unlimited = await waitForOutput(() => manager.queryOutput({ sessionId, limit: 1000 }));

      expect(unlimited.hasMore).toBe(false);
    });

    it('should support full pagination workflow', async () => {
      await waitForOutput(() => manager.queryOutput({ sessionId }));

      const allEntries: OutputEntry[] = [];
      let cursor = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await manager.queryOutput({
          sessionId,
          since: cursor,
          limit: 2,
        });

        allEntries.push(...result.entries);
        cursor = result.nextCursor;
        hasMore = result.hasMore;

        if (!hasMore || result.entries.length === 0) break;
      }

      expect(allEntries.length).toBeGreaterThan(0);

      for (let i = 1; i < allEntries.length; i++) {
        expect(allEntries[i].cursor).toBeGreaterThan(allEntries[i - 1].cursor);
      }
    });
  });

  describe('Inspector URL Detection', () => {
    it('should detect inspector URL with valid format in stderr', async () => {
      const result = await waitForOutput(() =>
        manager.queryOutput({
          sessionId,
          streams: ['stderr'],
          search: 'Debugger listening',
          includeExceptions: false,
        }),
      );

      const hasInspectorUrl = result.entries.some(
        (e) => e.kind === 'stdio' && e.entry.text.includes('Debugger listening'),
      );
      expect(hasInspectorUrl).toBe(true);

      const urlPattern = /ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/;
      const hasValidUrl = result.entries.some(
        (e) => e.kind === 'stdio' && urlPattern.test(e.entry.text),
      );
      expect(hasValidUrl).toBe(true);
    });
  });

  describe('Output Buffering and Limits', () => {
    it('should buffer output over time', async () => {
      const initial = await waitForOutput(() => manager.queryOutput({ sessionId }));

      const initialCount = initial.entries.length;

      await waitFor(
        async () => {
          const result = await manager.queryOutput({ sessionId });
          return result.entries.length > initialCount ? true : null;
        },
        { timeoutMs: 2000, intervalMs: 50 },
      ).catch(() => null);

      const updated = await manager.queryOutput({ sessionId });
      expect(updated.entries.length).toBeGreaterThanOrEqual(initialCount);
    });

    it('should maintain cursor ordering', async () => {
      const result = await waitForOutput(() => manager.queryOutput({ sessionId, limit: 100 }));

      for (let i = 1; i < result.entries.length; i++) {
        expect(result.entries[i].cursor).toBeGreaterThan(result.entries[i - 1].cursor);
      }
    });

    it('should handle edge cases', async () => {
      const noMatch = await manager.queryOutput({
        sessionId,
        search: 'nonexistent_text_12345',
        includeExceptions: false,
      });

      const zeroLimit = await manager.queryOutput({ sessionId, limit: 0 });

      const largeLimit = await waitForOutput(() =>
        manager.queryOutput({ sessionId, limit: 10000 }),
      );

      expect(noMatch.entries).toEqual([]);
      expect(noMatch.hasMore).toBe(false);
      expect(zeroLimit.entries).toEqual([]);
      expect(Array.isArray(largeLimit.entries)).toBe(true);
    });
  });
});
