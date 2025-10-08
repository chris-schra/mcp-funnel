import type { VitestSessionConfig, ConsoleQuery } from '../types/index.js';
import {
  expectString,
  optionalString,
  optionalNumber,
  optionalBoolean,
  optionalStringArray,
} from './validation.js';
import { SummaryStats } from '../types/summary';

/**
 * Parsed test selection result
 */
export interface ParsedTestSelection {
  files?: string[];
  namePatterns?: string[];
}

/**
 * Result query options
 */
export interface ResultQueryOptions {
  sessionId: string;
  includeStackTraces?: boolean;
  testFile?: string;
  testName?: string;
}

/**
 * Query results with file details
 */
interface QueryResults {
  files: Array<{
    file: string;
    tests: Array<{
      id: string;
      name: string;
      fullName: string;
      file: string;
      status: 'passed' | 'failed' | 'skipped' | 'pending';
      duration: number;
      error?: {
        message: string;
        stack?: string;
        expected?: unknown;
        actual?: unknown;
        diff?: string;
      };
      consoleCount: number;
    }>;
    duration: number;
    consoleCount: number;
  }>;
}

/**
 * Response from getResults - conditionally includes queryResults based on filters
 */
export interface GetResultsResponse {
  sessionId: string;
  summary: SummaryStats;
  queryResults?: QueryResults;
}

/**
 * Check if any content filters are applied to result query
 *
 * Content filters are testFile and testName patterns that determine
 * which tests to include. includeStackTraces is not a content filter,
 * it's a formatting option.
 *
 * @param options - Result query options
 * @returns True if any content filter is defined
 */
export function hasFilters(options: ResultQueryOptions): boolean {
  return options.testFile !== undefined || options.testName !== undefined;
}

/**
 * Parse test selection heuristic: files vs name patterns
 * Heuristic: if test contains '/' or ends with .ts/.js/.tsx/.jsx, treat as file; else test name pattern
 *
 * @param tests - Array of test identifiers
 * @returns Parsed test selection with files and/or name patterns
 */
export function parseTestSelection(tests?: string[]): ParsedTestSelection {
  if (!tests || tests.length === 0) {
    return {};
  }

  const files: string[] = [];
  const namePatterns: string[] = [];

  for (const test of tests) {
    // Heuristic: if contains '/' or ends with common test file extensions, it's a file path
    if (
      test.includes('/') ||
      test.endsWith('.ts') ||
      test.endsWith('.js') ||
      test.endsWith('.tsx') ||
      test.endsWith('.jsx')
    ) {
      files.push(test);
    } else {
      namePatterns.push(test);
    }
  }

  return {
    files: files.length > 0 ? files : undefined,
    namePatterns: namePatterns.length > 0 ? namePatterns : undefined,
  };
}

/**
 * Parse start session arguments from MCP input
 *
 * @param input - Raw input arguments
 * @returns Parsed session configuration
 * @throws Error if input is invalid
 */
export function parseStartSessionArgs(input: Record<string, unknown>): VitestSessionConfig {
  const tests = optionalStringArray(input.tests, 'tests');
  const testPattern = optionalString(input.testPattern, 'testPattern');
  const root = optionalString(input.root, 'root');
  const configPath = optionalString(input.configPath, 'configPath');
  const timeout = optionalNumber(input.timeout, 'timeout');
  const maxTimeout = optionalNumber(input.maxTimeout, 'maxTimeout');
  const maxConsoleEntries = optionalNumber(input.maxConsoleEntries, 'maxConsoleEntries');
  const consoleLogTTL = optionalNumber(input.consoleLogTTL, 'consoleLogTTL');

  return {
    tests,
    testPattern,
    root,
    configPath,
    timeout,
    maxTimeout,
    maxConsoleEntries,
    consoleLogTTL,
  };
}

/**
 * Parse console query arguments from MCP input
 *
 * @param input - Raw input arguments
 * @returns Parsed console query
 * @throws Error if input is invalid
 */
export function parseConsoleQueryArgs(input: Record<string, unknown>): ConsoleQuery {
  const sessionId = expectString(input.sessionId, 'sessionId');
  const streamType = optionalString(input.streamType, 'streamType') as
    | 'stdout'
    | 'stderr'
    | 'both'
    | undefined;
  const taskId = optionalString(input.taskId, 'taskId');
  const testFile = optionalString(input.testFile, 'testFile');
  const testName = optionalString(input.testName, 'testName');
  const search = optionalString(input.search, 'search');
  const useRegex = optionalBoolean(input.useRegex, 'useRegex');
  const caseSensitive = optionalBoolean(input.caseSensitive, 'caseSensitive');
  const limit = optionalNumber(input.limit, 'limit');
  const skip = optionalNumber(input.skip, 'skip');
  const after = optionalNumber(input.after, 'after');
  const before = optionalNumber(input.before, 'before');

  // Validate streamType
  if (streamType && !['stdout', 'stderr', 'both'].includes(streamType)) {
    throw new Error(`streamType must be one of: stdout, stderr, both (got: ${streamType})`);
  }

  return {
    sessionId,
    streamType,
    taskId,
    testFile,
    testName,
    search,
    useRegex,
    caseSensitive,
    limit,
    skip,
    after,
    before,
  };
}

/**
 * Parse result query arguments from MCP input
 *
 * @param input - Raw input arguments
 * @returns Parsed result query options
 * @throws Error if input is invalid
 */
export function parseResultQueryArgs(input: Record<string, unknown>): ResultQueryOptions {
  const sessionId = expectString(input.sessionId, 'sessionId');
  const includeStackTraces = optionalBoolean(input.includeStackTraces, 'includeStackTraces');
  const testFile = optionalString(input.testFile, 'testFile');
  const testName = optionalString(input.testName, 'testName');

  return {
    sessionId,
    includeStackTraces,
    testFile,
    testName,
  };
}

/**
 * Parse session status arguments from MCP input
 *
 * @param input - Raw input arguments
 * @returns Session ID
 * @throws Error if input is invalid
 */
export function parseSessionStatusArgs(input: Record<string, unknown>): string {
  return expectString(input.sessionId, 'sessionId');
}
