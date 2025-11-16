import { beforeEach, describe, expect, it } from 'vitest';
import { OutputBuffer } from '../src/debugger/output-buffer.js';
import {
  createConsoleEntry,
  createExceptionEntry,
  createStdioEntry,
} from './utils/entry-factories.js';

describe('OutputBuffer - Storage', () => {
  let buffer: OutputBuffer;
  const testSessionId = 'test-session';

  beforeEach(() => {
    buffer = new OutputBuffer();
  });

  describe('addStdio', () => {
    it('should add stdio entry and increment cursor', () => {
      const entry = createStdioEntry('stdout', 'test output');

      buffer.addStdio(entry);

      const snapshot = buffer.snapshot();
      expect(snapshot.stdio).toHaveLength(1);
      expect(snapshot.stdio[0]).toBe(entry);
      expect(buffer.getLastCursor()).toBe(1);
    });

    it('should handle multiple stdio entries with monotonic cursors', () => {
      buffer.addStdio(createStdioEntry('stdout', 'first'));
      buffer.addStdio(createStdioEntry('stderr', 'second'));
      buffer.addStdio(createStdioEntry('stdout', 'third'));

      expect(buffer.getLastCursor()).toBe(3);
      const snapshot = buffer.snapshot();
      expect(snapshot.stdio).toHaveLength(3);
    });
  });

  describe('addConsole', () => {
    it('should add console entry and increment cursor', () => {
      const entry = createConsoleEntry('log', 'console message');

      buffer.addConsole(entry);

      const snapshot = buffer.snapshot();
      expect(snapshot.console).toHaveLength(1);
      expect(snapshot.console[0]).toBe(entry);
      expect(buffer.getLastCursor()).toBe(1);
    });

    it('should handle different console levels', () => {
      buffer.addConsole(createConsoleEntry('log', 'log message'));
      buffer.addConsole(createConsoleEntry('error', 'error message'));
      buffer.addConsole(createConsoleEntry('warn', 'warn message'));

      const snapshot = buffer.snapshot();
      expect(snapshot.console).toHaveLength(3);
      expect(buffer.getLastCursor()).toBe(3);
    });
  });

  describe('addException', () => {
    it('should add exception entry and increment cursor', () => {
      const entry = createExceptionEntry('Error: test error');

      buffer.addException(entry);

      const snapshot = buffer.snapshot();
      expect(snapshot.exceptions).toHaveLength(1);
      expect(snapshot.exceptions[0]).toBe(entry);
      expect(buffer.getLastCursor()).toBe(1);
    });
  });

  describe('snapshot', () => {
    it('should return empty arrays for empty buffer', () => {
      const snapshot = buffer.snapshot();

      expect(snapshot.stdio).toEqual([]);
      expect(snapshot.console).toEqual([]);
      expect(snapshot.exceptions).toEqual([]);
    });

    it('should categorize all entries by kind', () => {
      buffer.addStdio(createStdioEntry('stdout', 'output'));
      buffer.addConsole(createConsoleEntry('log', 'console'));
      buffer.addException(createExceptionEntry('error'));
      buffer.addStdio(createStdioEntry('stderr', 'error output'));

      const snapshot = buffer.snapshot();
      expect(snapshot.stdio).toHaveLength(2);
      expect(snapshot.console).toHaveLength(1);
      expect(snapshot.exceptions).toHaveLength(1);
    });

    it('should return original entry objects without cursor metadata', () => {
      const stdioEntry = createStdioEntry('stdout', 'test');
      buffer.addStdio(stdioEntry);

      const snapshot = buffer.snapshot();
      expect(snapshot.stdio[0]).toBe(stdioEntry);
    });
  });

  describe('getLastCursor', () => {
    it('should return 0 for empty buffer', () => {
      expect(buffer.getLastCursor()).toBe(0);
    });

    it('should return last cursor after adding entries', () => {
      buffer.addStdio(createStdioEntry('stdout', 'test'));
      expect(buffer.getLastCursor()).toBe(1);

      buffer.addConsole(createConsoleEntry('log', 'test'));
      expect(buffer.getLastCursor()).toBe(2);

      buffer.addException(createExceptionEntry('error'));
      expect(buffer.getLastCursor()).toBe(3);
    });

    it('should maintain cursor after buffer overflow', () => {
      const smallBuffer = new OutputBuffer(2);

      smallBuffer.addStdio(createStdioEntry('stdout', '1'));
      smallBuffer.addStdio(createStdioEntry('stdout', '2'));
      smallBuffer.addStdio(createStdioEntry('stdout', '3'));

      // Cursor continues incrementing even when entries are shifted out
      expect(smallBuffer.getLastCursor()).toBe(3);
    });
  });

  describe('maxEntries limit', () => {
    it('should use default max of 2000 entries', () => {
      const defaultBuffer = new OutputBuffer();

      for (let i = 0; i < 2100; i++) {
        defaultBuffer.addStdio(createStdioEntry('stdout', `line ${i}`));
      }

      const snapshot = defaultBuffer.snapshot();
      expect(snapshot.stdio).toHaveLength(2000);
    });

    it('should respect custom maxEntries limit', () => {
      const customBuffer = new OutputBuffer(5);

      for (let i = 0; i < 10; i++) {
        customBuffer.addStdio(createStdioEntry('stdout', `line ${i}`));
      }

      const snapshot = customBuffer.snapshot();
      expect(snapshot.stdio).toHaveLength(5);
    });

    it('should remove oldest entries when exceeding limit', () => {
      const smallBuffer = new OutputBuffer(3);

      smallBuffer.addStdio(createStdioEntry('stdout', 'first'));
      smallBuffer.addStdio(createStdioEntry('stdout', 'second'));
      smallBuffer.addStdio(createStdioEntry('stdout', 'third'));
      smallBuffer.addStdio(createStdioEntry('stdout', 'fourth'));

      const snapshot = smallBuffer.snapshot();
      expect(snapshot.stdio).toHaveLength(3);
      expect(snapshot.stdio[0].text).toBe('second');
      expect(snapshot.stdio[2].text).toBe('fourth');
    });

    it('should maintain cursor sequence after buffer overflow', () => {
      const smallBuffer = new OutputBuffer(2);

      smallBuffer.addStdio(createStdioEntry('stdout', 'entry 1'));
      smallBuffer.addStdio(createStdioEntry('stdout', 'entry 2'));
      smallBuffer.addStdio(createStdioEntry('stdout', 'entry 3'));

      const result = smallBuffer.query({ sessionId: testSessionId });

      // Should have entries with cursor 2 and 3 (cursor 1 was shifted out)
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].cursor).toBe(2);
      expect(result.entries[1].cursor).toBe(3);
    });

    it('should handle query after entries removed by overflow', () => {
      const smallBuffer = new OutputBuffer(2);

      smallBuffer.addStdio(createStdioEntry('stdout', '1'));
      smallBuffer.addStdio(createStdioEntry('stdout', '2'));
      smallBuffer.addStdio(createStdioEntry('stdout', '3'));

      // Query with since=1 (which was removed)
      const result = smallBuffer.query({
        sessionId: testSessionId,
        since: 1,
      });

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].cursor).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle query with limit=0', () => {
      buffer.addStdio(createStdioEntry('stdout', 'test'));

      const result = buffer.query({ sessionId: testSessionId, limit: 0 });

      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(true);
    });

    it('should handle query with since equal to last cursor', () => {
      buffer.addStdio(createStdioEntry('stdout', 'test'));

      const lastCursor = buffer.getLastCursor();
      const result = buffer.query({
        sessionId: testSessionId,
        since: lastCursor,
      });

      expect(result.entries).toEqual([]);
      expect(result.nextCursor).toBe(lastCursor);
      expect(result.hasMore).toBe(false);
    });

    it('should handle mixed entry types maintaining cursor order', () => {
      buffer.addStdio(createStdioEntry('stdout', 'first'));
      buffer.addConsole(createConsoleEntry('log', 'second'));
      buffer.addException(createExceptionEntry('third'));

      const result = buffer.query({ sessionId: testSessionId });

      expect(result.entries[0].cursor).toBe(1);
      expect(result.entries[1].cursor).toBe(2);
      expect(result.entries[2].cursor).toBe(3);
      expect(result.entries[0].kind).toBe('stdio');
      expect(result.entries[1].kind).toBe('console');
      expect(result.entries[2].kind).toBe('exception');
    });
  });
});
