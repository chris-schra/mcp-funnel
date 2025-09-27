import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  ConsoleMessage,
} from '../types/index.js';

export interface SearchConsoleOutputHandlerArgs {
  sessionId: string;
  levels?: Record<string, boolean>;
  search?: string;
  since?: number;
}

/**
 * Handler for searching console output from debug sessions
 * Implements the IToolHandler SEAM for modular tool handling
 */
export class SearchConsoleOutputHandler
  implements IToolHandler<SearchConsoleOutputHandlerArgs>
{
  readonly name = 'search_console_output';

  async handle(
    args: SearchConsoleOutputHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      // First, check for mock session
      if (context.mockSessionManager?.getMockSession(args.sessionId)) {
        return context.mockSessionManager.getConsoleOutputMock(args.sessionId, {
          levels: args.levels,
          search: args.search,
          since: args.since,
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

      // Default levels: warn and error only
      const levels = args.levels || { warn: true, error: true };

      // Get console output from the session
      let output =
        args.since !== undefined
          ? session.consoleOutput.slice(args.since)
          : session.consoleOutput;

      // Filter by levels
      output = output.filter((msg) => levels[msg.level] === true);

      // Filter by search string if provided
      if (args.search) {
        output = this.filterBySearchString(output, args.search);
      }

      return context.responseFormatter.consoleOutput({
        sessionId: args.sessionId,
        consoleOutput: this.formatConsoleMessages(output),
        filters: {
          levels,
          search: args.search,
        },
        totalCount: session.consoleOutput.length,
        filteredCount: output.length,
        status: session.state.status,
      });
    } catch (error) {
      return context.sessionValidator.createHandlerError(
        args.sessionId,
        error,
        'search_console_output',
      );
    }
  }

  /**
   * Filter console messages by search string
   */
  private filterBySearchString(
    messages: ConsoleMessage[],
    search: string,
  ): ConsoleMessage[] {
    const searchLower = search.toLowerCase();
    return messages.filter(
      (msg) =>
        msg.message.toLowerCase().includes(searchLower) ||
        msg.args.some((arg) => String(arg).toLowerCase().includes(searchLower)),
    );
  }

  /**
   * Format console messages for output
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
