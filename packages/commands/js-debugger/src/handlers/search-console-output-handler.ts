import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  ConsoleMessage,
} from '../types/index.js';

/**
 * Arguments for searching and filtering console output from a debug session.
 * @public
 * @see file:./search-console-output-handler.ts:19 - SearchConsoleOutputHandler implementation
 */
export interface SearchConsoleOutputHandlerArgs {
  /** Unique identifier of the debug session to query */
  sessionId: string;
  /** Log level filter mapping level names to inclusion status. Defaults to `{ warn: true, error: true }` */
  levels?: Record<string, boolean>;
  /** Case-insensitive search term to filter messages and args. If omitted, no text filtering is applied */
  search?: string;
  /** Starting index in the console output array. If provided, only messages from this index onward are returned */
  since?: number;
}

/**
 * Handler for searching and filtering console output from debug sessions.
 * Provides flexible console log querying with level filtering, text search,
 * and incremental retrieval. Supports both real debug sessions and mock sessions
 * for testing. Returns the most recent 10 matching messages after applying all filters.
 * Key behaviors:
 * - Defaults to showing only warn and error levels unless overridden
 * - Performs case-insensitive search across both message text and args
 * - Supports pagination via the `since` parameter for incremental reads
 * - Returns at most the last 10 matching messages (see formatConsoleMessages)
 * @example Basic usage - get recent errors
 * ```typescript
 * const handler = new SearchConsoleOutputHandler();
 * const result = await handler.handle(
 *   { sessionId: 'session-123' },
 *   context
 * );
 * // Returns last 10 warn/error messages
 * ```
 * @example Custom level filtering
 * ```typescript
 * const result = await handler.handle(
 *   {
 *     sessionId: 'session-123',
 *     levels: { log: true, info: true, error: true }
 *   },
 *   context
 * );
 * ```
 * @example Text search with pagination
 * ```typescript
 * const result = await handler.handle(
 *   {
 *     sessionId: 'session-123',
 *     search: 'timeout',
 *     since: 100  // Only check messages from index 100 onward
 *   },
 *   context
 * );
 * ```
 * @public
 * @see file:../types/handlers.ts:14 - IToolHandler interface
 * @see file:../types/console.ts:3 - ConsoleMessage type definition
 * @see file:../command/tool-registration.ts:158 - Handler registration
 */
export class SearchConsoleOutputHandler
  implements IToolHandler<SearchConsoleOutputHandlerArgs>
{
  public readonly name = 'search_console_output';

  /**
   * Handles console output search requests for a debug session.
   * Validates the session exists (or delegates to mock manager), applies
   * level and text filters, then formats the results using the response formatter.
   * Always returns at most 10 messages via formatConsoleMessages truncation.
   * @param {SearchConsoleOutputHandlerArgs} args - Search parameters including session ID and optional filters
   * @param {ToolHandlerContext} context - Shared handler context with session manager, validators, and formatters
   * @returns {Promise<CallToolResult>} Promise resolving to formatted console output with filter metadata and counts
   * @public
   */
  public async handle(
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
   * Filters console messages by case-insensitive text search.
   * Searches both the message text and all args (converted to strings).
   * A message matches if the search term appears in either location.
   * @param {ConsoleMessage[]} messages - Console messages to filter
   * @param {string} search - Search term to match (case-insensitive)
   * @returns {ConsoleMessage[]} Filtered array containing only messages that match the search term
   * @internal
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
   * Formats console messages for output, returning only the most recent 10 messages.
   * Truncates the message array to the last 10 entries and extracts only
   * the fields needed for display (level, timestamp, message, args).
   * This prevents overwhelming the client with excessive console output.
   * The hardcoded limit of 10 messages is a practical constraint to keep
   * response sizes manageable. Clients can use the `since` parameter for
   * pagination if they need to see earlier messages.
   * @param {ConsoleMessage[]} messages - Console messages to format (already filtered by level/search)
   * @returns {Array<{level: string, timestamp: string, message: string, args: unknown[]}>} Array of formatted messages, limited to the last 10 entries
   * @internal
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
