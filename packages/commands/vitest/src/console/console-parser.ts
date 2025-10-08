import type { UserConsoleLog } from 'vitest';
import type { ParsedConsoleEntry, TestContext } from '../types/index.js';

/**
 * Parser for converting Vitest console logs to ParsedConsoleEntry format
 */
export class ConsoleParser {
  private nextId = 0;

  /**
   * Parse a UserConsoleLog into a ParsedConsoleEntry
   *
   * @param sessionId - Session ID for this entry
   * @param log - Raw console log from Vitest
   * @param testContext - Optional test context for enrichment
   * @returns Parsed console entry
   */
  public parse(
    sessionId: string,
    log: UserConsoleLog,
    testContext?: TestContext,
  ): ParsedConsoleEntry {
    const entry: ParsedConsoleEntry = {
      id: this.nextId++,
      sessionId,
      taskId: log.taskId,
      type: log.type,
      timestamp: log.time,
      message: log.content,
    };

    // Enrich with test context if provided
    if (testContext) {
      entry.testId = testContext.id;
      entry.testName = testContext.name;
      entry.testFile = testContext.file;
    }

    return entry;
  }

  /**
   * Reset the ID counter (useful for testing)
   */
  public reset(): void {
    this.nextId = 0;
  }
}
