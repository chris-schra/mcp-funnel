import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
} from '../types/index.js';

/**
 * Arguments for retrieving stack trace from a debug session.
 * @public
 * @see file:./get-stacktrace-handler.ts:15 - GetStacktraceHandler implementation
 */
export interface GetStacktraceHandlerArgs {
  /** Session identifier from debug or continue operations */
  sessionId: string;
}

/**
 * Handler for getting stack trace from paused debug sessions.
 *
 * Retrieves and formats the call stack from a paused debug session, including
 * location context, breakpoint status, and pause reason messaging.
 * Implements the IToolHandler SEAM for modular tool handling within the debugger command.
 * @example
 * ```typescript
 * const handler = new GetStacktraceHandler();
 * const result = await handler.handle(
 *   \{ sessionId: 'debug-123' \},
 *   context
 * );
 * ```
 * @public
 * @see file:../types/handlers.ts:14 - IToolHandler interface
 * @see file:../sessions/session-validator.ts:77 - Session validation
 */
export class GetStacktraceHandler
  implements IToolHandler<GetStacktraceHandlerArgs>
{
  /** Tool name identifier for MCP registration */
  public readonly name = 'get_stacktrace';

  /**
   * Handles stack trace retrieval for paused sessions.
   *
   * Validates session state, retrieves stack frames from the debug adapter,
   * and formats the stack trace with location and breakpoint context.
   * All errors are caught and returned as CallToolResult.
   * @param args - Stack trace request parameters with session ID
   * @param context - Handler context with session manager and formatters
   * @returns MCP-formatted response with stack trace data or error
   * @public
   */
  public async handle(
    args: GetStacktraceHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      // First, check for mock session
      if (context.mockSessionManager?.getMockSession(args.sessionId)) {
        return context.mockSessionManager.getStackTraceMock(args.sessionId);
      }

      // Validate real session exists and is paused
      const validation = context.sessionValidator.validatePausedSession(
        args.sessionId,
      );
      if ('error' in validation) {
        return validation.error;
      }

      const { session } = validation;

      const stackTrace = await session.adapter.getStackTrace();

      return context.responseFormatter.stackTrace(
        args.sessionId,
        session,
        stackTrace.map((frame) => ({
          frameId: frame.id,
          functionName: frame.functionName,
          file: frame.file,
          line: frame.line,
          column: frame.column,
          origin: frame.origin,
          relativePath: frame.relativePath,
        })),
      );
    } catch (error) {
      return context.sessionValidator.createHandlerError(
        args.sessionId,
        error,
        'get_stack_trace',
      );
    }
  }
}
