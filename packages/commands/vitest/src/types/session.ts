import type { TestModule, Vitest } from 'vitest/node';
import type { ConsoleStorage } from '../console/console-storage.js';
import { SummaryStats } from './summary';

/**
 * Test session configuration
 */
export interface VitestSessionConfig {
  /** Test selection: file paths OR test name patterns */
  tests?: string[];

  /** Glob pattern (alternative to tests array) */
  testPattern?: string;

  /** Project root directory where tests execute */
  root?: string;

  /** Path to vitest config file (if different from root, for fixture isolation) */
  configPath?: string;

  /** User-facing timeout in ms - returns partial results if hit (default: 30000) */
  timeout?: number;

  /** Internal hard timeout in ms - kills process (default: 2 * timeout or 120000) */
  maxTimeout?: number;

  /** Maximum console entries to retain per session (default: 10000) */
  maxConsoleEntries?: number;

  /** Console log TTL in ms (default: 300000 = 5 min) */
  consoleLogTTL?: number;
}

/**
 * Session status
 */
export type SessionStatus = 'running' | 'completed' | 'timeout' | 'killed';

/**
 * Session data (internal storage)
 */
export interface SessionData {
  id: string;
  config: VitestSessionConfig;
  status: SessionStatus;
  startedAt: number;
  completedAt?: number;

  // Storage
  consoleStorage: ConsoleStorage;
  testModules?: readonly TestModule[];
  summary?: TestSummary;

  // Runtime
  vitestInstance?: Vitest; // Vitest instance for cleanup
}

/**
 * Test session (external view)
 */
export interface VitestSession {
  id: string;
  status: SessionStatus;
  config: VitestSessionConfig;
  startedAt: number;
  completedAt?: number;
  summary?: TestSummary;
}

/**
 * AI-optimized test result summary
 */
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;

  /** Files tested (compact: only include files with failures by default) */
  files: TestFileResult[];

  /** Console output metadata */
  console: {
    total: number;
    byStream: {
      stdout: number;
      stderr: number;
    };
  };
}

/**
 * Per-file test results (token-optimized)
 */
export interface TestFileResult {
  /** Relative path to test file */
  file: string;

  /** Test cases (only include failed/interesting tests by default) */
  tests: TestCaseResult[];

  /** Duration */
  duration: number;

  /** File-level console output count */
  consoleCount: number;
}

/**
 * Individual test case result
 */
export interface TestCaseResult {
  id: string;
  name: string;
  fullName: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;

  /** Error details (only if failed) */
  error?: {
    message: string;
    stack?: string;
    expected?: unknown;
    actual?: unknown;
    diff?: string;
  };

  /** Console output count for this test */
  consoleCount: number;
}

/**
 * Start session result (minimal summary to force AI to use getResults for details)
 */
export interface StartSessionResult {
  sessionId: string;
  status: SessionStatus;
  summary: SummaryStats & {
    running?: number;
  };
  slowFiles?: Array<{
    file: string;
    duration: number;
    status: string;
    completed: number;
    total: number;
  }>;
  message?: string;
  suggestions?: string[];
}
