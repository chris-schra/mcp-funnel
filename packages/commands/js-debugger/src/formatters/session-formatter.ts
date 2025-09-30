import type { SessionLifecycleState, DebugState } from '../types/index.js';

/**
 * Session lifecycle and list formatting utilities.
 *
 * Provides static formatting methods for session management operations including
 * session lists, status messages, termination responses, and console output.
 * All methods return plain objects suitable for MCP tool responses.
 *
 * This formatter is part of the response formatting architecture, coordinated
 * by DebugResponseFormatter which wraps these raw data structures in
 * standardized MCP CallToolResult envelopes.
 * @example
 * ```typescript
 * // Format active sessions list
 * const data = SessionFormatter.sessionsList(sessions, mockSessions);
 * // Returns: { sessions: [...] }
 *
 * // Format running session status
 * const status = SessionFormatter.runningSession(sessionId, 'node', './script.js');
 * // Returns: { sessionId, status: 'running', message: '...', platform, target }
 * ```
 * @see file:./debug-response-formatter.ts:13-125 - Main coordinator that uses this formatter
 * @see file:./base-formatter.ts - Base success/error wrapper
 * @public
 */
export class SessionFormatter {
  /**
   * Formats a combined list of real and mock debug sessions.
   *
   * Merges active real sessions with mock sessions (used for testing) into a
   * single array. The returned object structure matches MCP tool response format
   * expectations for the list_sessions tool.
   * @param sessions - Array of active real debug sessions from session manager
   * @param mockSessions - Optional array of mock sessions for testing scenarios
   * @returns Object containing merged sessions array with key 'sessions'
   * @example
   * ```typescript
   * const realSessions = sessionManager.listSessions();
   * const mockSessions = mockManager.listMockSessions();
   * const result = SessionFormatter.sessionsList(realSessions, mockSessions);
   * // Returns: { sessions: [...realSessions, ...mockSessions] }
   * ```
   * @see file:../handlers/list-sessions-handler.ts:26 - Primary call site
   * @see file:./debug-response-formatter.ts:33-50 - Wrapper that adds MCP envelope
   * @public
   */
  public static sessionsList(
    sessions: Array<{
      id: string;
      platform: string;
      target: string;
      state: DebugState;
      startTime: string;
      metadata?: {
        lifecycleState?: SessionLifecycleState;
        lastActivity?: string;
        resourceCount?: number;
      };
    }>,
    mockSessions?: Array<{ id: string; mock: true; [key: string]: unknown }>,
  ): Record<string, unknown> {
    const allSessions = [...sessions, ...(mockSessions || [])];
    return { sessions: allSessions };
  }

  /**
   * Formats console output response with filtering metadata.
   *
   * Returns the console output data structure unchanged (pass-through formatter).
   * The data includes console messages, applied filters, counts, and session status.
   * This method exists as a SEAM for potential future transformations or enrichment.
   * @param data - Console output data structure
   * @param data.sessionId - Debug session identifier
   * @param data.consoleOutput - Array of formatted console messages (last 10 by default)
   * @param data.filters - Applied filter criteria (levels, search terms)
   * @param data.totalCount - Total console messages in session before filtering
   * @param data.filteredCount - Number of messages after filtering
   * @param data.status - Current session debug state ('running', 'paused', 'terminated')
   * @returns Unmodified data object for MCP tool response
   * @example
   * ```typescript
   * const data = SessionFormatter.consoleOutput({
   *   sessionId: 'abc123',
   *   consoleOutput: [{ level: 'error', timestamp: '...', message: 'Failed', args: [] }],
   *   filters: { levels: { error: true }, search: 'Failed' },
   *   totalCount: 150,
   *   filteredCount: 3,
   *   status: 'paused'
   * });
   * ```
   * @see file:../handlers/search-console-output-handler.ts:65-74 - Primary call site
   * @see file:./debug-response-formatter.ts:52-67 - Wrapper that adds MCP envelope
   * @public
   */
  public static consoleOutput(data: {
    sessionId: string;
    consoleOutput: Array<{
      level: string;
      timestamp: string;
      message: string;
      args: unknown[];
    }>;
    filters?: unknown;
    totalCount: number;
    filteredCount?: number;
    status: string;
  }): Record<string, unknown> {
    return data;
  }

  /**
   * Formats a status response for a running debug session.
   *
   * Creates a standardized status object indicating that a debug session is
   * actively running and will pause when it hits a breakpoint or completes.
   * Used when debug operations start execution but don't immediately pause.
   * @param sessionId - Unique identifier for the running debug session
   * @param platform - Debug platform ('node' or 'browser')
   * @param target - Target being debugged (script path for Node, URL for browser)
   * @returns Status object with running state, user message, and session context
   * @example
   * ```typescript
   * const status = SessionFormatter.runningSession(
   *   'session-123',
   *   'node',
   *   '/project/src/index.ts'
   * );
   * // Returns: {
   * //   sessionId: 'session-123',
   * //   status: 'running',
   * //   message: 'Running… Will pause at next breakpoint or completion.',
   * //   platform: 'node',
   * //   target: '/project/src/index.ts'
   * // }
   * ```
   * @see file:../handlers/debug-handler.ts:116-118 - Called when session starts running
   * @see file:./debug-response-formatter.ts:69-76 - Wrapper that adds MCP envelope
   * @public
   */
  public static runningSession(
    sessionId: string,
    platform: string,
    target: string,
  ): Record<string, unknown> {
    return {
      sessionId,
      status: 'running',
      message: 'Running… Will pause at next breakpoint or completion.',
      platform,
      target,
    };
  }

  /**
   * Formats a response for a terminated debug session.
   *
   * Creates a standardized termination object indicating that a debug session
   * has ended, either by user action (stop command) or system-initiated cleanup.
   * The message parameter provides context about why termination occurred.
   * @param sessionId - Unique identifier for the terminated session
   * @param message - Human-readable explanation of termination reason
   * @returns Termination status object with session ID, status, and reason message
   * @example
   * ```typescript
   * // User-initiated termination
   * const result = SessionFormatter.terminatedSession(
   *   'session-456',
   *   'Debug session terminated by user'
   * );
   * // Returns: {
   * //   sessionId: 'session-456',
   * //   status: 'terminated',
   * //   message: 'Debug session terminated by user'
   * // }
   * ```
   * @see file:../handlers/continue-handler.ts:58-60 - Called on user stop action
   * @see file:./debug-response-formatter.ts:78-81 - Wrapper that adds MCP envelope
   * @public
   */
  public static terminatedSession(
    sessionId: string,
    message: string,
  ): Record<string, unknown> {
    return {
      sessionId,
      status: 'terminated',
      message,
    };
  }

  /**
   * Formats console messages by limiting to the last 10 entries.
   *
   * Truncates a console message array to the most recent 10 messages and
   * normalizes the structure by explicitly mapping to a clean object shape.
   * This prevents unbounded growth in MCP tool responses while preserving
   * the most recent debugging context.
   *
   * The slice(-10) operation keeps the tail of the array, meaning the most
   * recent messages are retained while older messages are discarded. The
   * mapping step ensures consistent object shape even if source messages
   * have additional properties.
   * @param messages - Array of console messages from a debug session
   * @returns Array containing at most the last 10 messages with normalized structure
   * @example
   * ```typescript
   * const allMessages = session.consoleOutput; // 150 messages
   * const recent = SessionFormatter.formatConsoleMessages(allMessages);
   * // Returns: Last 10 messages with structure:
   * // [{ level: 'log', timestamp: '...', message: '...', args: [...] }, ...]
   * ```
   * @see file:../handlers/search-console-output-handler.ts:106-111 - Primary usage
   * @see file:../session/memory-manager.ts:41-46 - Console buffer management
   * @public
   */
  public static formatConsoleMessages(
    messages: Array<{
      level: string;
      timestamp: string;
      message: string;
      args: unknown[];
    }>,
  ): Array<{
    level: string;
    timestamp: string;
    message: string;
    args: unknown[];
  }> {
    return messages.slice(-10).map((msg) => ({
      level: msg.level,
      timestamp: msg.timestamp,
      message: msg.message,
      args: msg.args,
    }));
  }
}
