import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
} from '../types.js';

export interface GetStacktraceHandlerArgs {
  sessionId: string;
}

/**
 * Handler for getting stack trace from paused debug sessions
 * Implements the IToolHandler SEAM for modular tool handling
 */
export class GetStacktraceHandler
  implements IToolHandler<GetStacktraceHandlerArgs>
{
  readonly name = 'get_stacktrace';

  async handle(
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
        stackTrace.map((frame) => ({
          frameId: frame.id,
          functionName: frame.functionName,
          file: frame.file,
          line: frame.line,
          column: frame.column,
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
