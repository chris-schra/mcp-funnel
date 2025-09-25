import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  DebugState,
} from '../types.js';

export interface ContinueHandlerArgs {
  sessionId: string;
  action?: 'continue' | 'step_over' | 'step_into' | 'step_out' | 'stop';
  evaluate?: string;
}

/**
 * Handler for continuing debug sessions
 * Implements the IToolHandler SEAM for modular tool handling
 */
export class ContinueHandler implements IToolHandler<ContinueHandlerArgs> {
  readonly name = 'continue';

  async handle(
    args: ContinueHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      // First, check for mock session
      if (context.mockSessionManager?.getMockSession(args.sessionId)) {
        return context.mockSessionManager.continueMockSession(args.sessionId, {
          action: args.action,
          evaluate: args.evaluate,
        });
      }

      // Validate real session exists
      const validation = context.sessionValidator.validateSession(
        args.sessionId,
      );
      if ('error' in validation) {
        return validation.error;
      }

      const { session } = validation;

      // Handle evaluate request
      if (args.evaluate) {
        const result = await session.adapter.evaluate(args.evaluate);
        return context.responseFormatter.evaluation(args.sessionId, {
          expression: args.evaluate,
          result: result.value,
          type: result.type,
          error: result.error,
        });
      }

      // Handle stop action
      if (args.action === 'stop') {
        await session.adapter.disconnect();
        context.sessionManager.deleteSession(args.sessionId);
        return context.responseFormatter.terminatedSession(
          args.sessionId,
          'Debug session terminated by user',
        );
      }

      // Handle step actions
      let newState: DebugState;
      switch (args.action) {
        case 'step_over':
          newState = await session.adapter.stepOver();
          break;
        case 'step_into':
          newState = await session.adapter.stepInto();
          break;
        case 'step_out':
          newState = await session.adapter.stepOut();
          break;
        case 'continue':
        default:
          newState = await session.adapter.continue();
          break;
      }

      session.state = newState;
      return await context.responseFormatter.debugState(
        args.sessionId,
        session,
      );
    } catch (error) {
      return context.sessionValidator.createHandlerError(
        args.sessionId,
        error,
        'continue_debug_session',
      );
    }
  }
}
