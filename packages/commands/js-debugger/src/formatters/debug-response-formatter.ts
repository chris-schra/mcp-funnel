import type {
  CallToolResult,
  DebugSession,
  SessionLifecycleState,
  DebugState,
  CodeOrigin,
} from '../types/index.js';
import { BaseResponseFormatter } from './base-formatter.js';
import { SessionFormatter } from './session-formatter.js';
import { StackFormatter } from './stack-formatter.js';
import { VariableFormatter } from './variable-formatter.js';

/**
 * Main response formatter that coordinates specialized formatters
 *
 * Implements the IResponseFormatter SEAM by delegating to focused modules:
 * - BaseResponseFormatter: Core success/error formatting
 * - SessionFormatter: Session lifecycle and list operations
 * - StackFormatter: Debug state and stack trace formatting
 * - VariableFormatter: Variable inspection and evaluation
 *
 * This eliminates the original 415-line monolithic formatter
 */
export class DebugResponseFormatter extends BaseResponseFormatter {
  public async debugState(
    sessionId: string,
    session: DebugSession,
  ): Promise<CallToolResult> {
    const data = await StackFormatter.formatDebugState(sessionId, session);
    return this.success(data);
  }

  public sessionsList(
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
  ): CallToolResult {
    const data = SessionFormatter.sessionsList(sessions, mockSessions);
    return this.success(data);
  }

  public consoleOutput(data: {
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
  }): CallToolResult {
    const formattedData = SessionFormatter.consoleOutput(data);
    return this.success(formattedData);
  }

  public runningSession(
    sessionId: string,
    platform: string,
    target: string,
  ): CallToolResult {
    const data = SessionFormatter.runningSession(sessionId, platform, target);
    return this.success(data);
  }

  public terminatedSession(sessionId: string, message: string): CallToolResult {
    const data = SessionFormatter.terminatedSession(sessionId, message);
    return this.success(data);
  }

  public stackTrace(
    sessionId: string,
    session: DebugSession,
    stackTrace: Array<{
      frameId: number;
      functionName: string;
      file: string;
      line: number;
      column?: number;
      origin?: CodeOrigin;
      relativePath?: string;
    }>,
  ): CallToolResult {
    const data = StackFormatter.formatStackTrace(
      sessionId,
      session,
      stackTrace,
    );
    return this.success(data);
  }

  public variables(
    sessionId: string,
    frameId: number,
    data: { path: string; result: unknown },
  ): CallToolResult {
    const formattedData = VariableFormatter.variables(sessionId, frameId, data);
    return this.success(formattedData);
  }

  public evaluation(
    sessionId: string,
    evaluation: {
      expression?: string;
      result: unknown;
      type: string;
      error?: string;
    },
  ): CallToolResult {
    const data = VariableFormatter.evaluation(sessionId, evaluation);
    return this.success(data);
  }
}
