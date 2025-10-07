import { beforeEach, describe, expect, it } from 'vitest';
import { OutputBuffer } from '../src/debugger/output-buffer.js';
import {
  createConsoleEntry,
  createExceptionEntry,
  createStdioEntry,
} from './utils/entry-factories.js';

describe('OutputBuffer - Basic Queries', () => {
  let buffer: OutputBuffer;
  const testSessionId = 'test-session';

  beforeEach(() => {
    buffer = new OutputBuffer();
  });

  describe('query', () => {
    beforeEach(() => {
      // Setup buffer with diverse entries for testing
      buffer.addStdio(createStdioEntry('stdout', 'stdout line 1'));
      buffer.addStdio(createStdioEntry('stderr', 'stderr line 1'));
      buffer.addConsole(createConsoleEntry('log', 'log message'));
      buffer.addConsole(createConsoleEntry('error', 'error message'));
      buffer.addException(createExceptionEntry('Error: test'));
    });

    it('should return all entries when no filters applied', () => {
      const result = buffer.query({ sessionId: testSessionId });

      expect(result.entries).toHaveLength(5);
      expect(result.nextCursor).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('should return empty result for empty buffer', () => {
      const emptyBuffer = new OutputBuffer();
      const result = emptyBuffer.query({ sessionId: testSessionId });

      expect(result.entries).toEqual([]);
      expect(result.nextCursor).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    describe('cursor pagination', () => {
      it('should filter entries after since cursor', () => {
        const result = buffer.query({ sessionId: testSessionId, since: 2 });

        expect(result.entries).toHaveLength(3);
        expect(result.entries[0].cursor).toBe(3);
        expect(result.nextCursor).toBe(5);
      });

      it('should return empty when since is beyond last cursor', () => {
        const result = buffer.query({ sessionId: testSessionId, since: 10 });

        expect(result.entries).toEqual([]);
        expect(result.nextCursor).toBe(10);
        expect(result.hasMore).toBe(false);
      });

      it('should use since=0 as default', () => {
        const resultDefault = buffer.query({ sessionId: testSessionId });
        const resultExplicit = buffer.query({
          sessionId: testSessionId,
          since: 0,
        });

        expect(resultDefault.entries).toEqual(resultExplicit.entries);
      });
    });

    describe('limit', () => {
      it('should respect limit parameter', () => {
        const result = buffer.query({ sessionId: testSessionId, limit: 2 });

        expect(result.entries).toHaveLength(2);
        expect(result.nextCursor).toBe(2);
        expect(result.hasMore).toBe(true);
      });

      it('should use default limit of 100 when not specified', () => {
        const largeBuffer = new OutputBuffer();
        for (let i = 0; i < 150; i++) {
          largeBuffer.addStdio(createStdioEntry('stdout', `line ${i}`));
        }

        const result = largeBuffer.query({ sessionId: testSessionId });

        expect(result.entries).toHaveLength(100);
        expect(result.hasMore).toBe(true);
      });

      it('should set hasMore=false when limit exceeds available entries', () => {
        const result = buffer.query({ sessionId: testSessionId, limit: 100 });

        expect(result.entries).toHaveLength(5);
        expect(result.hasMore).toBe(false);
      });

      it('should combine limit with since cursor', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          since: 1,
          limit: 2,
        });

        expect(result.entries).toHaveLength(2);
        expect(result.entries[0].cursor).toBe(2);
        expect(result.nextCursor).toBe(3);
        expect(result.hasMore).toBe(true);
      });
    });

    describe('streams filter', () => {
      it('should filter stdio entries by stdout stream', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          streams: ['stdout'],
        });

        // Should include: stdout stdio, 2 console, 1 exception (4 total)
        expect(result.entries).toHaveLength(4);
        const stdioEntries = result.entries.filter((e) => e.kind === 'stdio');
        expect(stdioEntries).toHaveLength(1);
        if (stdioEntries[0].kind === 'stdio') {
          expect(stdioEntries[0].entry.stream).toBe('stdout');
        }
      });

      it('should filter stdio entries by stderr stream', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          streams: ['stderr'],
        });

        // Should include: stderr stdio, 2 console, 1 exception (4 total)
        expect(result.entries).toHaveLength(4);
        const stdioEntries = result.entries.filter((e) => e.kind === 'stdio');
        expect(stdioEntries).toHaveLength(1);
        if (stdioEntries[0].kind === 'stdio') {
          expect(stdioEntries[0].entry.stream).toBe('stderr');
        }
      });

      it('should filter by multiple streams', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          streams: ['stdout', 'stderr'],
        });

        // Should include all 5 entries (both streams pass filter)
        expect(result.entries).toHaveLength(5);
        const stdioEntries = result.entries.filter((e) => e.kind === 'stdio');
        expect(stdioEntries).toHaveLength(2);
      });

      it('should include console and exception entries when streams filter is set', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          streams: ['stdout'],
        });

        // Streams filter only affects stdio entries, others pass through
        const hasConsole = result.entries.some((e) => e.kind === 'console');
        const hasException = result.entries.some((e) => e.kind === 'exception');
        expect(hasConsole).toBe(true);
        expect(hasException).toBe(true);
      });
    });

    describe('levels filter', () => {
      it('should filter console entries by log level', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          levels: ['log'],
        });

        // Should include: 1 log console, 2 stdio, 1 exception (4 total)
        expect(result.entries).toHaveLength(4);
        const consoleEntries = result.entries.filter((e) => e.kind === 'console');
        expect(consoleEntries).toHaveLength(1);
        if (consoleEntries[0].kind === 'console') {
          expect(consoleEntries[0].entry.level).toBe('log');
        }
      });

      it('should filter console entries by error level', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          levels: ['error'],
        });

        // Should include: 1 error console, 2 stdio, 1 exception (4 total)
        expect(result.entries).toHaveLength(4);
        const consoleEntries = result.entries.filter((e) => e.kind === 'console');
        expect(consoleEntries).toHaveLength(1);
        if (consoleEntries[0].kind === 'console') {
          expect(consoleEntries[0].entry.level).toBe('error');
        }
      });

      it('should filter by multiple levels', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          levels: ['log', 'error'],
        });

        // Should include all 5 entries (both levels pass filter)
        expect(result.entries).toHaveLength(5);
        const consoleEntries = result.entries.filter((e) => e.kind === 'console');
        expect(consoleEntries).toHaveLength(2);
      });

      it('should include stdio and exception entries when levels filter is set', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          levels: ['log'],
        });

        // Levels filter only affects console entries, others pass through
        const hasStdio = result.entries.some((e) => e.kind === 'stdio');
        const hasException = result.entries.some((e) => e.kind === 'exception');
        expect(hasStdio).toBe(true);
        expect(hasException).toBe(true);
      });
    });

    describe('includeExceptions filter', () => {
      it('should include exceptions by default', () => {
        const result = buffer.query({ sessionId: testSessionId });

        const hasException = result.entries.some((e) => e.kind === 'exception');
        expect(hasException).toBe(true);
      });

      it('should include exceptions when explicitly true', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          includeExceptions: true,
        });

        const hasException = result.entries.some((e) => e.kind === 'exception');
        expect(hasException).toBe(true);
      });

      it('should exclude exceptions when false', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          includeExceptions: false,
        });

        const hasException = result.entries.some((e) => e.kind === 'exception');
        expect(hasException).toBe(false);
        expect(result.entries).toHaveLength(4);
      });

      it('should correctly calculate hasMore when excluding exceptions', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          includeExceptions: false,
          limit: 3,
        });

        expect(result.entries).toHaveLength(3);
        expect(result.hasMore).toBe(true);
      });
    });
  });
});
