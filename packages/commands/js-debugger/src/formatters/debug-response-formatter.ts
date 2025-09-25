import type {
  IResponseFormatter,
  CallToolResult,
  DebugSession,
  ConsoleMessage,
  SessionLifecycleState,
  DebugState,
} from '../types.js';

/**
 * Standard response formatter that eliminates JSON formatting duplication
 * Implements the IResponseFormatter SEAM for consistent output across all handlers
 */
export class DebugResponseFormatter implements IResponseFormatter {
  success(data: unknown): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  error(message: string, details?: unknown): CallToolResult {
    const errorData: Record<string, unknown> = { error: message };
    if (details !== undefined) {
      errorData.details = details;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorData, null, 2),
        },
      ],
      isError: true,
    };
  }

  async debugState(
    sessionId: string,
    session: DebugSession,
  ): Promise<CallToolResult> {
    const { state, consoleOutput } = session;

    if (state.status === 'terminated') {
      return this.success({
        sessionId,
        status: 'completed',
        message: 'Debug session completed',
      });
    }

    if (state.status === 'paused') {
      const stackTrace = await session.adapter.getStackTrace();
      const topFrame = stackTrace[0];
      const scopes = topFrame
        ? await session.adapter.getScopes(topFrame.id)
        : [];

      const variables: Record<string, unknown> = {};
      for (const scope of scopes) {
        variables[scope.type] = Object.fromEntries(
          scope.variables.map((v) => [v.name, v.value]),
        );
      }

      return this.success({
        sessionId,
        status: 'paused',
        pauseReason: state.pauseReason,
        breakpoint: state.breakpoint,
        exception: state.exception,
        stackTrace: stackTrace.map((frame) => ({
          functionName: frame.functionName,
          file: frame.file,
          line: frame.line,
          column: frame.column,
        })),
        variables,
        consoleOutput: this.formatConsoleMessages(consoleOutput),
        message: `Paused${state.pauseReason ? ` at ${state.pauseReason}` : ''}. Use js-debugger_continue tool to proceed.`,
      });
    }

    return this.success({
      sessionId,
      status: state.status,
      message: 'Debug session is running',
    });
  }

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
  ): CallToolResult {
    const allSessions = [...sessions, ...(mockSessions || [])];
    return this.success({ sessions: allSessions });
  }

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
  }): CallToolResult {
    return this.success(data);
  }

  /**
   * Formats debug session info for running sessions
   */
  runningSession(
    sessionId: string,
    platform: string,
    target: string,
  ): CallToolResult {
    return this.success({
      sessionId,
      status: 'running',
      message: `Debug session started. Use js-debugger_search_console_output with sessionId "${sessionId}" to search console output.`,
      platform,
      target,
    });
  }

  /**
   * Formats session termination response
   */
  terminatedSession(sessionId: string, message: string): CallToolResult {
    return this.success({
      sessionId,
      status: 'terminated',
      message,
    });
  }

  /**
   * Formats stack trace response
   */
  stackTrace(
    sessionId: string,
    stackTrace: Array<{
      frameId: number;
      functionName: string;
      file: string;
      line: number;
      column?: number;
    }>,
  ): CallToolResult {
    return this.success({
      sessionId,
      status: 'paused',
      stackTrace,
      frameCount: stackTrace.length,
      message: `Stack trace with ${stackTrace.length} frames`,
    });
  }

  /**
   * Formats variable inspection response
   */
  variables(
    sessionId: string,
    frameId: number,
    data: {
      path?: string;
      maxDepth?: number;
      scopes?: unknown[];
      result?: unknown;
    },
  ): CallToolResult {
    const response: Record<string, unknown> = {
      sessionId,
      frameId,
      ...data,
    };

    if (data.path) {
      response.message = `Variable inspection for path: ${data.path}`;
    } else {
      response.message = `Variable inspection for frame ${frameId} with max depth ${data.maxDepth || 3}`;
    }

    return this.success(response);
  }

  /**
   * Formats evaluation result
   */
  evaluation(
    sessionId: string,
    evaluation: {
      expression?: string;
      result: unknown;
      type: string;
      error?: string;
    },
  ): CallToolResult {
    return this.success({
      sessionId,
      evaluation,
      status: 'paused',
      message: 'Evaluation complete. Session still paused.',
    });
  }

  /**
   * Formats console messages for output
   */
  private formatConsoleMessages(messages: ConsoleMessage[]) {
    return messages.slice(-10).map((msg) => ({
      level: msg.level,
      timestamp: msg.timestamp,
      message: msg.message,
      args: msg.args,
    }));
  }
}
