import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  DebugState,
} from '../types/index.js';

/**
 * Arguments for debug session control operations.
 *
 * Supports multiple control actions (continue, stepping) as well as
 * expression evaluation and session termination within a single unified interface.
 * @public
 * @see file:./continue-handler.ts:42 - ContinueHandler implementation
 */
export interface ContinueHandlerArgs {
  /** Session ID to control */
  sessionId: string;
  /** Control action to perform - defaults to 'continue' if not specified */
  action?: 'continue' | 'step_over' | 'step_into' | 'step_out' | 'stop';
  /** JavaScript expression to evaluate in the current pause context */
  evaluate?: string;
}

/**
 * Tool handler for debug session control operations.
 *
 * Provides unified handling for:
 * - Resuming execution (continue)
 * - Step-based debugging (step_over, step_into, step_out)
 * - Expression evaluation at breakpoints
 * - Session termination
 *
 * The handler automatically routes between mock and real debug sessions,
 * validates session state, and formats responses consistently.
 *
 * IMPORTANT: When using the 'continue' action with real (non-mock) sessions, the handler
 * accesses the enhanced session's continue method via getEnhancedSession().
 * This is necessary because DebugSession.adapter intentionally omits 'continue'
 * to avoid conflicts with the enhanced session's continue implementation.
 * @example Basic continue operation
 * ```typescript
 * const handler = new ContinueHandler();
 * const result = await handler.handle(
 *   { sessionId: 'session-123', action: 'continue' },
 *   context
 * );
 * ```
 * @example Step over with evaluation
 * ```typescript
 * const result = await handler.handle(
 *   { sessionId: 'session-123', action: 'step_over', evaluate: 'user.name' },
 *   context
 * );
 * ```
 * @public
 * @see file:../types/handlers.ts:14 - IToolHandler interface
 * @see file:../types/session.ts:36 - DebugSession interface
 * @see file:./index.ts:2 - Handler exports
 */
export class ContinueHandler implements IToolHandler<ContinueHandlerArgs> {
  public readonly name = 'continue';

  /**
   * Executes debug session control operations based on the provided action.
   *
   * Processing flow:
   * 1. Checks for mock session and routes to mock handler if found
   * 2. Validates that real session exists and is accessible
   * 3. Handles evaluation requests if evaluate is provided
   * 4. Handles stop action by terminating session
   * 5. Executes stepping actions (step_over, step_into, step_out)
   * 6. Executes continue action via enhanced session
   * 7. Updates session state and returns formatted response
   * @param args - Control operation parameters including session ID and action
   * @param context - Shared handler context providing session management and formatting
   * @returns Formatted result containing updated debug state or error information
   * @see file:../types/handlers.ts:22 - ToolHandlerContext interface
   * @see file:../types/session.ts:68-71 - Stepping methods on IDebugSession
   * @see file:../enhanced-debug-session.ts - Enhanced session implementation
   */
  public async handle(
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
        await context.sessionManager.deleteSession(args.sessionId);
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
        default: {
          // Access the underlying enhanced session's continue method directly
          const enhancedSession = session.getEnhancedSession
            ? session.getEnhancedSession()
            : null;

          // Type guard for enhanced session with continue method
          interface SessionWithContinue {
            continue(): Promise<DebugState>;
          }

          const hasValidContinue = (
            obj: unknown,
          ): obj is SessionWithContinue => {
            return (
              obj !== null &&
              typeof obj === 'object' &&
              'continue' in obj &&
              typeof (obj as SessionWithContinue).continue === 'function'
            );
          };

          if (hasValidContinue(enhancedSession)) {
            newState = await enhancedSession.continue();
          } else {
            throw new Error(
              'Enhanced session not available for continue operation',
            );
          }
          break;
        }
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
