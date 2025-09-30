import type { SessionLifecycleState } from './SessionLifecycleState.js';
import type { CallToolResult } from './CallToolResult.js';
import type { DebugSession } from './DebugSession.js';
import type { DebugState } from './DebugState.js';

/**
 * Response formatting extension point - eliminates JSON formatting duplication
 */
export interface IResponseFormatter {
  success(data: unknown): CallToolResult;
  error(message: string, details?: unknown): CallToolResult;
  debugState(sessionId: string, session: DebugSession): Promise<CallToolResult>;
  sessionsList(
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
  ): CallToolResult;
  consoleOutput(data: {
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
  }): CallToolResult;
  runningSession(
    sessionId: string,
    platform: string,
    target: string,
  ): CallToolResult;
  terminatedSession(sessionId: string, message: string): CallToolResult;
  stackTrace(
    sessionId: string,
    stackTrace: Array<{
      frameId: number;
      functionName: string;
      file: string;
      line: number;
      column?: number;
    }>,
  ): CallToolResult;
  variables(
    sessionId: string,
    frameId: number,
    data: {
      path?: string;
      maxDepth?: number;
      scopes?: unknown[];
      result?: unknown;
    },
  ): CallToolResult;
  evaluation(
    sessionId: string,
    evaluation: {
      expression?: string;
      result: unknown;
      type: string;
      error?: string;
    },
  ): CallToolResult;
}
