import { describe, it, expect } from 'vitest';
import { VitestSessionManager } from '../session-manager.js';
import type { ConsoleQuery } from '../../types/index.js';
import { createVitestFixture } from '../../../test/utils.js';

describe('VitestSessionManager - Console Query', () => {
  it('should query console output from session', async () => {
    const { manager, sessionId, cleanup } = await createVitestFixture('console-output');

    try {
      const query: ConsoleQuery = {
        sessionId,
      };

      const consoleResult = manager.queryConsole(query);

      // console-output fixture has multiple console.log calls
      expect(consoleResult.entries.length).toBeGreaterThan(0);
      expect(consoleResult.totalMatches).toBeGreaterThan(0);

      // Verify entries have expected structure
      const entry = consoleResult.entries[0];
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('message');
      expect(entry).toHaveProperty('timestamp');
      expect(['stdout', 'stderr']).toContain(entry.type);
    } finally {
      await cleanup();
    }
  });

  it('should filter console output by stream type', async () => {
    const { manager, sessionId, cleanup } = await createVitestFixture('console-output');

    try {
      // Query for stderr only (console.error and console.warn)
      const query: ConsoleQuery = {
        sessionId,
        streamType: 'stderr',
      };

      const consoleResult = manager.queryConsole(query);

      // console-output has console.error and console.warn calls
      expect(consoleResult.entries.length).toBeGreaterThan(0);

      // All entries should be stderr
      for (const entry of consoleResult.entries) {
        expect(entry.type).toBe('stderr');
      }
    } finally {
      await cleanup();
    }
  });

  it('should throw error when querying console for non-existent session', () => {
    const manager = new VitestSessionManager();

    try {
      expect(() => {
        manager.queryConsole({ sessionId: 'non-existent-session-id' });
      }).toThrow('Session not found: non-existent-session-id');
    } finally {
      manager.destroy();
    }
  });
});
