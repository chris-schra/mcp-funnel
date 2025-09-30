import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
} from '../types/index.js';

export interface StopHandlerArgs {
  sessionId: string;
}

/**
 * Handler for stopping debug sessions
 * Implements the IToolHandler SEAM for modular tool handling
 */
export class StopHandler implements IToolHandler<StopHandlerArgs> {
  readonly name = 'stop';

  async handle(
    args: StopHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      // First, check for mock session
      if (context.mockSessionManager?.getMockSession(args.sessionId)) {
        return context.mockSessionManager.stopMockSession(args.sessionId);
      }

      // Validate real session exists
      const validation = context.sessionValidator.validateSession(
        args.sessionId,
      );
      if ('error' in validation) {
        return validation.error;
      }

      // Clean disconnect and termination - delegate to session manager cleanup
      await context.sessionManager.deleteSession(args.sessionId);

      return context.responseFormatter.success({
        sessionId: args.sessionId,
        status: 'terminated',
        message: 'Debug session stopped and cleaned up successfully',
        cleanup: {
          resourcesReleased: true,
          memoryFreed: true,
          timeoutsCleared: true,
        },
      });
    } catch (error) {
      return context.sessionValidator.createHandlerError(
        args.sessionId,
        error,
        'stop_debug_session',
      );
    }
  }
}
