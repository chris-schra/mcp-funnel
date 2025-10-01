import { beforeEach, describe, expect, it } from 'vitest';
import { OutputBuffer } from '../src/debugger/output-buffer.js';
import type {
  ConsoleEntry,
  ExceptionEntry,
  StdioEntry,
} from '../src/types/index.js';

describe('OutputBuffer - Advanced Queries', () => {
  let buffer: OutputBuffer;
  const testSessionId = 'test-session';

  beforeEach(() => {
    buffer = new OutputBuffer();
  });

  // Helper factories to follow DRY principle
  const createStdioEntry = (
    stream: 'stdout' | 'stderr',
    text: string,
  ): StdioEntry => ({
    stream,
    text,
    timestamp: Date.now(),
    offset: 0,
  });

  const createConsoleEntry = (
    level: 'log' | 'error' | 'warn' | 'info' | 'debug',
    text: string,
  ): ConsoleEntry => ({
    level,
    origin: 'console',
    text,
    arguments: [
      {
        remote: { type: 'string', value: text },
        text,
      },
    ],
    timestamp: Date.now(),
  });

  const createExceptionEntry = (text: string): ExceptionEntry => ({
    text,
    timestamp: Date.now(),
    details: {
      exceptionId: 1,
      text,
      lineNumber: 0,
      columnNumber: 0,
    },
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

    describe('search filter', () => {
      it('should perform case-insensitive search on stdio entries', () => {
        buffer.addStdio(createStdioEntry('stdout', 'UPPERCASE TEXT'));
        const result = buffer.query({
          sessionId: testSessionId,
          search: 'uppercase',
        });

        const found = result.entries.some(
          (e) => e.kind === 'stdio' && e.entry.text.includes('UPPERCASE TEXT'),
        );
        expect(found).toBe(true);
      });

      it('should search console entry text', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          search: 'error message',
        });

        expect(result.entries).toHaveLength(1);
        expect(result.entries[0].kind).toBe('console');
        if (result.entries[0].kind === 'console') {
          expect(result.entries[0].entry.text).toBe('error message');
        }
      });

      it('should search console entry arguments', () => {
        buffer.addConsole({
          level: 'log',
          origin: 'console',
          text: 'main text',
          arguments: [
            {
              remote: { type: 'string', value: 'arg' },
              text: 'searchable',
            },
          ],
          timestamp: Date.now(),
        });

        const result = buffer.query({
          sessionId: testSessionId,
          search: 'searchable',
        });

        const found = result.entries.some(
          (e) =>
            e.kind === 'console' &&
            e.entry.arguments.some((arg) => arg.text === 'searchable'),
        );
        expect(found).toBe(true);
      });

      it('should search exception entry text', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          search: 'Error: test',
        });

        expect(result.entries).toHaveLength(1);
        expect(result.entries[0].kind).toBe('exception');
      });

      it('should return empty result when search matches nothing', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          search: 'nonexistent',
        });

        expect(result.entries).toEqual([]);
        expect(result.hasMore).toBe(false);
      });

      it('should handle partial text matching', () => {
        buffer.addStdio(createStdioEntry('stdout', 'partial match text'));
        const result = buffer.query({
          sessionId: testSessionId,
          search: 'match',
        });

        const found = result.entries.some(
          (e) => e.kind === 'stdio' && e.entry.text.includes('partial match'),
        );
        expect(found).toBe(true);
      });

      it('should handle empty search string', () => {
        buffer.addStdio(createStdioEntry('stdout', 'test'));

        const result = buffer.query({ sessionId: testSessionId, search: '' });

        // Empty search should match all (no filtering)
        expect(result.entries).toHaveLength(6);
      });
    });

    describe('combined filters', () => {
      it('should combine streams and limit', () => {
        buffer.addStdio(createStdioEntry('stdout', 'out1'));
        buffer.addStdio(createStdioEntry('stdout', 'out2'));

        const result = buffer.query({
          sessionId: testSessionId,
          streams: ['stdout'],
          limit: 1,
        });

        expect(result.entries).toHaveLength(1);
        expect(result.hasMore).toBe(true);
      });

      it('should combine levels and search', () => {
        buffer.addConsole(createConsoleEntry('error', 'critical error'));

        const result = buffer.query({
          sessionId: testSessionId,
          levels: ['error'],
          search: 'critical',
        });

        expect(result.entries).toHaveLength(1);
      });

      it('should combine all filters together', () => {
        const result = buffer.query({
          sessionId: testSessionId,
          since: 0,
          limit: 10,
          streams: ['stdout'],
          levels: ['log'],
          includeExceptions: false,
          search: 'stdout',
        });

        // Should only match stdio entries with 'stdout' in text
        expect(
          result.entries.every(
            (e) =>
              e.kind === 'stdio' &&
              e.entry.stream === 'stdout' &&
              e.entry.text.includes('stdout'),
          ),
        ).toBe(true);
      });

      it('should correctly set hasMore with multiple filters', () => {
        const testBuffer = new OutputBuffer();
        for (let i = 0; i < 10; i++) {
          testBuffer.addStdio(createStdioEntry('stdout', `line ${i}`));
        }

        const result = testBuffer.query({
          sessionId: testSessionId,
          streams: ['stdout'],
          limit: 5,
        });

        expect(result.entries).toHaveLength(5);
        expect(result.hasMore).toBe(true);
      });

      it('should handle filters with no matching entries', () => {
        const freshBuffer = new OutputBuffer();
        freshBuffer.addStdio(createStdioEntry('stdout', 'output'));

        const result = freshBuffer.query({
          sessionId: testSessionId,
          streams: ['stderr'],
        });

        expect(result.entries).toEqual([]);
        expect(result.hasMore).toBe(false);
        expect(result.nextCursor).toBe(0);
      });
    });
  });
});
