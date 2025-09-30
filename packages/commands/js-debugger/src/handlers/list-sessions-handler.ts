import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
} from '../types/index.js';

export type ListSessionsHandlerArgs = Record<string, never>;

/**
 * Handler for listing active debug sessions
 * Implements the IToolHandler SEAM for modular tool handling
 */
export class ListSessionsHandler
  implements IToolHandler<ListSessionsHandlerArgs>
{
  public readonly name = 'list_sessions';

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
