import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
} from '../types/index.js';

/**
 * Arguments for stopping a debug session.
 *
 * Minimal interface containing only the session identifier needed to terminate
 * and clean up an active debugging session.
 * @public
 * @see file:./stop-handler.ts:39 - StopHandler implementation
 */
export interface StopHandlerArgs {
  /** Session ID of the debug session to terminate */
  sessionId: string;
}

/**
 * Tool handler for stopping and cleaning up debug sessions.
 *
 * Terminates both mock and real debug sessions, ensuring proper cleanup of
 * all associated resources including timeouts, memory, and process connections.
 *
 * Processing flow:
 * - Checks if session is a mock session and routes to mock handler
 * - Validates that real session exists before attempting termination
 * - Delegates cleanup to SessionManager.deleteSession which handles:
 *   - CDP connection termination
 *   - Process cleanup
 *   - Resource deallocation
 *   - Timeout/heartbeat cancellation
 * - Returns success response with cleanup confirmation
 *
 * The handler is safe to call multiple times on the same session ID - subsequent
 * calls will return a "session not found" error rather than throwing.
 * @example Stopping a debug session
 * ```typescript
 * const handler = new StopHandler();
 * const result = await handler.handle(
 *   { sessionId: 'session-abc123' },
 *   context
 * );
 * // Result includes cleanup confirmation:
 * // { resourcesReleased: true, memoryFreed: true, timeoutsCleared: true }
 * ```
 * @public
 * @see file:../types/handlers.ts:14 - IToolHandler interface
 * @see file:../session-manager.ts:219 - SessionManager.deleteSession implementation
 * @see file:../adapters/mock-session-manager.ts:230 - Mock session termination
 */
export class StopHandler implements IToolHandler<StopHandlerArgs> {
  public readonly name = 'stop';

  /**
   * Stops a debug session and releases all associated resources.
   *
   * Handles termination for both mock and real debug sessions. For real sessions,
   * delegates to SessionManager which performs comprehensive cleanup including:
   * CDP connection shutdown, process termination, memory deallocation, and
   * cancellation of active timers.
   *
   * The operation is idempotent - calling stop on an already-terminated session
   * returns an error response rather than throwing an exception.
   * @param args - Stop operation parameters containing the session ID
   * @param context - Shared handler context providing session management and formatting
   * @returns Promise resolving to a CallToolResult with termination status and cleanup details,
   * or an error response if the session doesn't exist
   * @throws Never throws - all errors are caught and returned as CallToolResult with isError flag
   * @see file:../types/handlers.ts:22 - ToolHandlerContext interface
   * @see file:../sessions/session-validator.ts:24 - Session validation logic
   */
  public async handle(
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
