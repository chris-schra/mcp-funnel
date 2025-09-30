import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
} from '../types/index.js';

/**
 * Arguments for the list_sessions tool handler.
 *
 * This tool accepts no parameters - it returns all active sessions.
 * @public
 */
export type ListSessionsHandlerArgs = Record<string, never>;

/**
 * Tool handler for listing all active debug sessions (both real and mock).
 *
 * Returns a comprehensive view of all sessions managed by the debugger, including:
 * - Real debug sessions connected via Chrome DevTools Protocol (CDP)
 * - Mock sessions used for testing and demonstration
 *
 * Each session includes its ID, platform, target, current debug state, start time,
 * and optional metadata (lifecycle state, activity tracking, resource usage).
 *
 * The handler implements the IToolHandler SEAM, enabling it to be registered
 * and invoked through the modular tool architecture without direct coupling
 * to the main command class.
 * @example Basic usage
 * ```typescript
 * const handler = new ListSessionsHandler();
 * const result = await handler.handle({}, context);
 * // Returns formatted list of all active sessions
 * ```
 * @public
 * @see file:../types/handlers.ts:14-17 - IToolHandler interface definition
 * @see file:../types/session.ts:99-110 - Session list format returned by sessionManager
 * @see file:../command/tool-registration.ts:135-138 - Registration in tool registry
 * @see file:../formatters/session-formatter.ts:48 - Session list formatting logic
 */
export class ListSessionsHandler
  implements IToolHandler<ListSessionsHandlerArgs>
{
  /**
   * Tool name identifier used for registration and invocation.
   * @public
   */
  public readonly name = 'list_sessions';

  /**
   * Executes the list sessions operation by aggregating real and mock sessions.
   *
   * Queries both the primary session manager (for real CDP sessions) and the
   * optional mock session manager, then formats the combined results for
   * MCP protocol response.
   *
   * This method never fails - if session listing encounters errors, they are
   * caught and returned as formatted error responses rather than throwing.
   * @param _args - Empty arguments object (no parameters required)
   * @param context - Handler context providing session managers and formatters
   * @returns Formatted response containing session list or error details
   * @example
   * ```typescript
   * const context: ToolHandlerContext = {
   *   sessionManager,
   *   mockSessionManager,
   *   responseFormatter,
   *   sessionValidator
   * };
   * const result = await handler.handle({}, context);
   * ```
   * @public
   * @see file:../types/handlers.ts:22-27 - ToolHandlerContext interface
   * @see file:../types/handlers.ts:36-50 - IResponseFormatter.sessionsList signature
   */
  public async handle(
    _args: ListSessionsHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      const realSessions = context.sessionManager.listSessions();
      const mockSessions = context.mockSessionManager?.listMockSessions() || [];

      return context.responseFormatter.sessionsList(realSessions, mockSessions);
    } catch (error) {
      return context.responseFormatter.error(
        error instanceof Error ? error.message : 'Unknown error',
        { operation: 'list_sessions' },
      );
    }
  }
}
