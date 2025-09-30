import type { SessionLifecycleState, DebugState } from '../types/index.js';

/**
 * Session lifecycle and list formatting utilities
 *
 * Handles formatting for session management operations:
 * - Sessions list display
 * - Running session status
 * - Session termination messages
 * - Console output formatting
 */
export class SessionFormatter {
  /**
   * Format sessions list response
   */
  static sessionsList(
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
   * Format console output response
   */
  static consoleOutput(data: {
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
   * Format running session status
   */
  static runningSession(
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
   * Format session termination response
   */
  static terminatedSession(
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
   * Format console messages for output (last 10 messages)
   */
  static formatConsoleMessages(
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
