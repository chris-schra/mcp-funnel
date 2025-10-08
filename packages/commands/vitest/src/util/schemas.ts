import type { Tool } from '@mcp-funnel/commands-core';

const STRING = 'string';
const NUMBER = 'number';
const BOOLEAN = 'boolean';

/**
 * Creates start session schema for vitest_startSession tool
 *
 * @returns Start session input schema
 */
export function createStartSessionSchema(): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: {
      tests: {
        type: 'array',
        items: { type: STRING },
        description:
          'Test selection: file paths OR test name patterns. ' +
          'Heuristic: paths contain "/" or end with .ts/.js/.tsx/.jsx; otherwise treated as name patterns.',
      },
      testPattern: {
        type: STRING,
        description: 'Glob pattern for test files (alternative to tests array).',
      },
      root: {
        type: STRING,
        description: 'Project root directory where tests execute (for fixture isolation).',
      },
      configPath: {
        type: STRING,
        description:
          'Full path to vitest config file. When omitted with root specified, disables config loading.',
      },
      timeout: {
        type: NUMBER,
        description:
          'User-facing timeout in milliseconds - returns partial results if hit (default: 30000).',
      },
      maxTimeout: {
        type: NUMBER,
        description:
          'Internal hard timeout in milliseconds - kills process (default: 2 * timeout or 120000).',
      },
      maxConsoleEntries: {
        type: NUMBER,
        description: 'Maximum console entries to retain per session (default: 10000).',
      },
      consoleLogTTL: {
        type: NUMBER,
        description: 'Console log TTL in milliseconds (default: 300000 = 5 minutes).',
      },
    },
  };
}

/**
 * Creates console query schema for vitest_queryConsole tool
 *
 * @returns Console query input schema
 */
export function createConsoleQuerySchema(): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: {
      sessionId: {
        type: STRING,
        description: 'Test session identifier.',
      },
      streamType: {
        type: STRING,
        enum: ['stdout', 'stderr', 'both'],
        description: 'Filter by stream type (default: both).',
      },
      taskId: {
        type: STRING,
        description: 'Filter by specific test task ID.',
      },
      testFile: {
        type: STRING,
        description: 'Filter by test file path (substring match).',
      },
      testName: {
        type: STRING,
        description: 'Filter by test name (substring match).',
      },
      search: {
        type: STRING,
        description: 'Search text in console messages.',
      },
      useRegex: {
        type: BOOLEAN,
        description: 'Treat search as regular expression (default: false).',
      },
      caseSensitive: {
        type: BOOLEAN,
        description: 'Case-sensitive search (default: false).',
      },
      limit: {
        type: NUMBER,
        description: 'Maximum number of entries to return (default: 100).',
      },
      skip: {
        type: NUMBER,
        description: 'Number of entries to skip for pagination (default: 0).',
      },
      after: {
        type: NUMBER,
        description: 'Return entries after this timestamp (milliseconds).',
      },
      before: {
        type: NUMBER,
        description: 'Return entries before this timestamp (milliseconds).',
      },
    },
    required: ['sessionId'],
  };
}

/**
 * Creates result query schema for vitest_getResults tool
 *
 * Returns only summary stats by default. Specify filters (testFile, testName,
 * includeStackTraces) to get detailed results in queryResults property.
 *
 * When no filters are specified, returns failed tests only by default.
 * When filters are specified, returns all test statuses matching the filters.
 *
 * @returns Result query input schema
 */
export function createResultQuerySchema(): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: {
      sessionId: {
        type: STRING,
        description: 'Test session identifier.',
      },
      includeStackTraces: {
        type: BOOLEAN,
        description: 'Include full stack traces in error details (default: true).',
      },
      testFile: {
        type: STRING,
        description:
          'Glob pattern to filter test files (e.g., "auth/**/*.test.ts", "login.test.ts").',
      },
      testName: {
        type: STRING,
        description:
          'Glob pattern to filter test names (e.g., "*should validate*", "MyComponent > *").',
      },
    },
    required: ['sessionId'],
  };
}

/**
 * Creates session status schema for vitest_getSessionStatus tool
 *
 * @returns Session status input schema
 */
export function createSessionStatusSchema(): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: {
      sessionId: {
        type: STRING,
        description: 'Test session identifier.',
      },
    },
    required: ['sessionId'],
  };
}
