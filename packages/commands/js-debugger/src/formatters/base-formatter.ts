import type {
  CallToolResult,
  IResponseFormatter,
  DebugSession,
  CodeOrigin,
} from '../types/index.js';

/**
 * Base response formatter providing core success/error formatting functionality
 *
 * SEAM: Implements IResponseFormatter interface for consistent output formatting
 * This base class eliminates JSON formatting duplication across all handlers
 */
export abstract class BaseResponseFormatter implements IResponseFormatter {
  /**
   * Format successful response data as JSON
   */
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

  /**
   * Format error response with optional details
   */
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

  // Abstract methods to be implemented by concrete formatters
  abstract debugState(
    sessionId: string,
    session: DebugSession,
  ): Promise<CallToolResult>;
  abstract sessionsList(
    sessions: unknown[],
    mockSessions?: unknown[],
  ): CallToolResult;
  abstract consoleOutput(data: unknown): CallToolResult;
  abstract runningSession(
    sessionId: string,
    platform: string,
    target: string,
  ): CallToolResult;
  abstract terminatedSession(
    sessionId: string,
    message: string,
  ): CallToolResult;
  abstract stackTrace(
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
  ): CallToolResult;
  abstract variables(
    sessionId: string,
    frameId: number,
    data: unknown,
  ): CallToolResult;
  abstract evaluation(
    sessionId: string,
    evaluation: {
      expression?: string;
      result: unknown;
      type: string;
      error?: string;
    },
  ): CallToolResult;
}
