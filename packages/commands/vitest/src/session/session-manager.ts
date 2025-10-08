import { randomUUID } from 'node:crypto';
import type { TestModule, Vitest } from 'vitest/node';
import type { UserConsoleLog } from 'vitest';
import { ConsoleStorage, ConsoleParser } from '../console/index.js';
import { formatResults, type FormatOptions, buildSummary } from '../results/index.js';
import { runVitest, type RunnerCallbacks } from './vitest-runner.js';
import type {
  VitestSessionConfig,
  SessionData,
  StartSessionResult,
  VitestSession,
  ConsoleQuery,
  ConsoleQueryResult,
  TestContext,
} from '../types/index.js';
import type { ResultQueryOptions, GetResultsResponse } from '../util/parsers.js';
import { hasFilters } from '../util/parsers.js';

/**
 * Default timeout values
 */
const DEFAULT_USER_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_TIMEOUT = 120000; // 2 minutes
const DEFAULT_MAX_CONSOLE_ENTRIES = 10000;
const DEFAULT_CONSOLE_LOG_TTL = 300000; // 5 minutes
const SESSION_TTL = 3600000; // 1 hour
const CLEANUP_INTERVAL = 60000; // 1 minute

/**
 * Manages vitest test sessions with timeout handling and console storage
 */
export class VitestSessionManager {
  private sessions = new Map<string, SessionData>();
  private parser = new ConsoleParser();
  private sessionTTL = SESSION_TTL;
  private cleanupInterval: NodeJS.Timeout;

  public constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSessions();
    }, CLEANUP_INTERVAL);
  }

  /**
   * Start a new test session with timeout handling
   *
   * Implements two-tier timeout:
   * - User timeout: Returns partial results, tests continue in background
   * - Hard timeout: Kills vitest process
   *
   * @param config - Session configuration
   * @returns Session start result with summary
   */
  // eslint-disable-next-line max-lines-per-function -- Complex coordinator method managing session lifecycle
  public async startSession(config: VitestSessionConfig): Promise<StartSessionResult> {
    const sessionId = randomUUID();
    const userTimeout = config.timeout ?? DEFAULT_USER_TIMEOUT;
    const hardTimeout = config.maxTimeout ?? Math.max(userTimeout * 2, DEFAULT_MAX_TIMEOUT);

    // Create console storage for this session
    const consoleStorage = new ConsoleStorage({
      maxEntries: config.maxConsoleEntries ?? DEFAULT_MAX_CONSOLE_ENTRIES,
      ttl: config.consoleLogTTL ?? DEFAULT_CONSOLE_LOG_TTL,
      maxEntriesPerSession: config.maxConsoleEntries ?? DEFAULT_MAX_CONSOLE_ENTRIES,
    });

    // Create session data
    const sessionData: SessionData = {
      id: sessionId,
      config,
      status: 'running',
      startedAt: Date.now(),
      consoleStorage,
    };

    // Store session
    this.sessions.set(sessionId, sessionData);

    // Track test context for console enrichment and completion state
    const testContextMap = new Map<string, TestContext>();
    let completed = false;
    let testModules: readonly TestModule[] | undefined;

    // Create callbacks for vitest runner
    const callbacks: RunnerCallbacks = {
      onConsoleLog: (log: UserConsoleLog) => {
        // Get test context if available
        const testContext = log.taskId ? testContextMap.get(log.taskId) : undefined;

        // Parse and store console entry
        const entry = this.parser.parse(sessionId, log, testContext);
        consoleStorage.add(sessionId, entry);
      },

      onComplete: (modules: readonly TestModule[]) => {
        // Build test context map from completed modules
        for (const module of modules) {
          for (const test of module.children.allTests()) {
            testContextMap.set(test.id, {
              id: test.id,
              name: test.name,
              file: module.moduleId,
            });
          }
        }

        // Store results
        testModules = modules;
        completed = true;
      },

      setVitestInstance: (vitest: Vitest) => {
        sessionData.vitestInstance = vitest;
      },
    };

    // Create test run promise
    const testRunPromise = runVitest(sessionId, config, callbacks)
      .then(() => {
        // Update session on completion
        if (completed && testModules) {
          sessionData.testModules = testModules;
          sessionData.status = 'completed';
          sessionData.completedAt = Date.now();
          sessionData.summary = formatResults(testModules, { sessionId }, consoleStorage);
        }
      })
      .catch((error: Error) => {
        // Handle test run errors
        sessionData.status = 'completed';
        sessionData.completedAt = Date.now();
        throw error;
      });

    // Create user timeout promise
    const userTimeoutPromise = new Promise<'user-timeout'>((resolve) => {
      setTimeout(() => resolve('user-timeout'), userTimeout);
    });

    // Create hard timeout promise
    const hardTimeoutPromise = new Promise<'hard-timeout'>((resolve) => {
      setTimeout(() => resolve('hard-timeout'), hardTimeout);
    });

    // Race between test completion and timeouts
    try {
      const result = await Promise.race([
        testRunPromise.then(() => 'completed' as const),
        userTimeoutPromise,
        hardTimeoutPromise,
      ]);

      if (result === 'completed') {
        // Tests completed successfully - return minimal summary
        if (!testModules) {
          throw new Error('Tests completed but no test modules available');
        }

        return {
          sessionId,
          status: 'completed',
          summary: buildSummary(testModules),
        };
      } else if (result === 'user-timeout') {
        // User timeout hit - return partial results
        sessionData.status = 'timeout';

        // Generate partial summary from current state (pass testModules if available)
        const partialSummary = this.getCurrentSummary(sessionData, testModules);

        return {
          sessionId,
          status: 'timeout',
          summary: partialSummary,
          message: `Test execution exceeded user timeout (${userTimeout}ms). Partial results returned. Tests continue in background.`,
          suggestions: [
            'Increase timeout parameter for longer test runs',
            'Use vitest_getResults to check for additional results',
          ],
        };
      } else {
        // Hard timeout - cleanup session
        await this.cleanupSession(sessionId);
        sessionData.status = 'killed';

        const partialSummary = this.getCurrentSummary(sessionData, testModules);

        return {
          sessionId,
          status: 'killed',
          summary: partialSummary,
          message: `Test execution exceeded hard timeout (${hardTimeout}ms). Vitest process killed.`,
          suggestions: [
            'Increase maxTimeout parameter',
            'Check for hanging tests or infinite loops',
          ],
        };
      }
    } catch (error) {
      // Handle errors during test run
      sessionData.status = 'completed';
      sessionData.completedAt = Date.now();

      throw new Error(
        `Test session failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Query console output from a session
   *
   * @param query - Console query parameters
   * @returns Query results with suggestions if truncated
   */
  public queryConsole(query: ConsoleQuery): ConsoleQueryResult {
    const session = this.getSession(query.sessionId);

    // Delegate to console storage
    const entries = session.consoleStorage.query(query.sessionId, query);

    // Check if results are truncated
    const totalMatches = entries.length;
    const limit = query.limit ?? totalMatches;
    const truncated = totalMatches > limit;

    const suggestions: string[] = [];
    if (truncated) {
      suggestions.push(
        `Results truncated. Use skip parameter to paginate (skip: ${limit})`,
        'Consider narrowing your query with additional filters',
      );
    }

    return {
      entries: entries.slice(0, limit),
      totalMatches,
      truncated,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * Get formatted test results from a session
   *
   * Returns summary-only by default, queryResults only when filters are provided.
   * This forces AI to be explicit about what it wants.
   *
   * @param options - Result query options
   * @returns Session results with conditional queryResults
   */
  public getResults(options: ResultQueryOptions): GetResultsResponse {
    const session = this.getSession(options.sessionId);

    if (!session.testModules) {
      throw new Error(`No test results available for session ${options.sessionId}`);
    }

    // Build summary stats from test modules
    const summary = buildSummary(session.testModules);

    // If no filters provided, return summary-only
    if (!hasFilters(options)) {
      return {
        sessionId: session.id,
        summary,
      };
    }

    // Filters provided - format full results
    // result-formatter automatically determines whether to show:
    // - All test statuses (when testFile/testName filters are provided)
    // - Only failed tests (when no testFile/testName filters are provided)
    const formatOptions: FormatOptions = {
      includeStackTraces: options.includeStackTraces,
      sessionId: session.id,
      testFile: options.testFile,
      testName: options.testName,
    };

    const fullResults = formatResults(session.testModules, formatOptions, session.consoleStorage);

    return {
      sessionId: session.id,
      summary,
      queryResults: {
        files: fullResults.files,
      },
    };
  }

  /**
   * Get current status of a session
   *
   * @param sessionId - Session identifier
   * @returns Session status
   */
  public getSessionStatus(sessionId: string): VitestSession {
    const session = this.getSession(sessionId);

    return {
      id: session.id,
      status: session.status,
      config: session.config,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      summary: session.summary,
    };
  }

  /**
   * Clean up a specific session and its resources
   *
   * @param sessionId - Session to clean up
   */
  public async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.vitestInstance) {
      try {
        await session.vitestInstance.close();
      } catch (_error) {
        // Ignore errors during cleanup
      }
      session.vitestInstance = undefined;
    }

    session.consoleStorage.clearSession(sessionId);
    this.sessions.delete(sessionId);
  }

  /**
   * Clean up manager resources
   */
  public async destroy(): Promise<void> {
    clearInterval(this.cleanupInterval);

    // Cleanup all sessions and wait for completion
    const cleanupPromises = Array.from(this.sessions.keys()).map((sessionId) =>
      this.cleanupSession(sessionId),
    );
    await Promise.all(cleanupPromises);
  }

  // --- Private methods ---

  /**
   * Get session by ID or throw error
   *
   * @param sessionId - Session identifier
   * @returns Session data
   */
  private getSession(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Get current summary for a running/partial session
   *
   * @param session - Session data
   * @param testModules - Optional test modules for partial results
   * @returns Minimal test summary
   */
  private getCurrentSummary(
    session: SessionData,
    testModules?: readonly TestModule[],
  ): StartSessionResult['summary'] {
    if (testModules && testModules.length > 0) {
      return buildSummary(testModules);
    }
    return {
      total: 0,
      passed: 0,
      failed: {},
      skipped: 0,
      duration: Date.now() - session.startedAt,
    };
  }

  /**
   * Clean up old sessions based on TTL
   */
  private cleanupOldSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.startedAt;
      if (age > this.sessionTTL) {
        void this.cleanupSession(sessionId);
      }
    }
  }
}
