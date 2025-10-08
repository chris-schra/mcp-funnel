/**
 * Parsed console entry (from UserConsoleLog)
 */
export interface ParsedConsoleEntry {
  id: number;
  sessionId: string;
  taskId?: string;
  type: 'stdout' | 'stderr';
  timestamp: number;
  message: string;

  // Test context (resolved from taskId)
  testId?: string;
  testName?: string;
  testFile?: string;
}

/**
 * Console query parameters
 */
export interface ConsoleQuery {
  sessionId: string;

  /** Filter by stream type */
  streamType?: 'stdout' | 'stderr' | 'both';

  /** Filter by test */
  taskId?: string;
  testFile?: string; // Substring match
  testName?: string; // Substring match

  /** Search in message */
  search?: string;
  useRegex?: boolean;
  caseSensitive?: boolean;

  /** Pagination */
  limit?: number;
  skip?: number;

  /** Time range */
  after?: number; // timestamp
  before?: number; // timestamp
}

/**
 * Console query result
 */
export interface ConsoleQueryResult {
  entries: ParsedConsoleEntry[];
  totalMatches: number;
  truncated: boolean;
  suggestions?: string[];
}

/**
 * Test context for console entries
 */
export interface TestContext {
  id: string;
  name: string;
  file: string;
}

/**
 * Console statistics for a session
 */
export interface ConsoleStats {
  total: number;
  byStream: { stdout: number; stderr: number };
}
