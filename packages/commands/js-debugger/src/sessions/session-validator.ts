import type {
  ISessionValidator,
  ISessionManager,
  IMockSessionManager,
  DebugSession,
  CallToolResult,
} from '../types/index.js';

/**
 * Session validation utilities providing standardized validation and error responses.
 *
 * Centralizes session validation logic to eliminate duplication across tool handlers.
 * Supports both real debug sessions and mock sessions, with automatic fallback checking.
 * All validation methods return either the validated session or a standardized error
 * response ready to be returned from tool handlers.
 *
 * Key features:
 * - Validates session existence with automatic mock session detection
 * - Validates paused state for operations requiring debugger to be stopped
 * - Generates consistent error responses across all handlers
 * - Integrates with both real and mock session managers
 * @example Basic validation in a tool handler
 * ```typescript
 * const validator = new SessionValidator(sessionManager, mockSessionManager);
 * const validation = validator.validateSession('session-123');
 * if ('error' in validation) {
 *   return validation.error;
 * }
 * const { session } = validation;
 * // Use session...
 * ```
 * @example Validating paused state
 * ```typescript
 * const validation = validator.validatePausedSession('session-123');
 * if ('error' in validation) {
 *   return validation.error; // Returns helpful error if not paused
 * }
 * // Session is guaranteed to be paused here
 * const stackTrace = await session.adapter.getStackTrace();
 * ```
 * @public
 * @see file:./session-validator.ts:24 - validateSession method
 * @see file:./session-validator.ts:77 - validatePausedSession method
 * @see file:../types/handlers.ts:105 - ISessionValidator interface
 * @see file:../handlers/get-stacktrace-handler.ts:31 - Example usage in handler
 */
export class SessionValidator implements ISessionValidator {
  /**
   * Creates a new session validator.
   * @param {ISessionManager} sessionManager - Manager for real debug sessions
   * @param {IMockSessionManager} [mockSessionManager] - Optional manager for mock sessions (used in testing)
   */
  public constructor(
    private sessionManager: ISessionManager,
    private mockSessionManager?: IMockSessionManager,
  ) {}

  /**
   * Validates that a debug session exists (real or mock).
   *
   * First checks the real session manager for the session. If not found, checks the
   * mock session manager (if available). If found in mock manager, returns a special
   * error indicating it's a mock session so the caller can route to the mock handler.
   * If not found anywhere, returns a standard "session not found" error with a list
   * of active session IDs for debugging.
   *
   * Return value uses discriminated union pattern - check for 'error' property to
   * determine if validation succeeded.
   * @param {string} sessionId - Unique identifier of the debug session to validate
   * @returns {{ session: DebugSession } | { error: CallToolResult }} Either `{ session: DebugSession }` if valid, or `{ error: CallToolResult }` if not found or is mock
   * @example
   * ```typescript
   * const validation = validator.validateSession('session-123');
   * if ('error' in validation) {
   *   return validation.error; // Already formatted for MCP tool response
   * }
   * const { session } = validation;
   * // Proceed with session operations
   * ```
   * @public
   * @see file:../types/handlers.ts:106-108 - ISessionValidator.validateSession interface
   * @see file:../handlers/continue-handler.ts:96 - Usage in continue handler
   * @see file:../handlers/search-console-output-handler.ts:99 - Usage in console handler
   */
  public validateSession(
    sessionId: string,
  ): { session: DebugSession } | { error: CallToolResult } {
    const session = this.sessionManager.getSession(sessionId);

    if (!session) {
      // Check for mock session if mock manager is available
      if (this.mockSessionManager?.getMockSession(sessionId)) {
        // This is a mock session, let the caller handle it
        return {
          error: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Session found but is mock - use mock session handler',
                  sessionId,
                  isMockSession: true,
                }),
              },
            ],
            isError: true,
          },
        };
      }

      return {
        error: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Session not found',
                sessionId,
                activeSessions: this.sessionManager
                  .listSessions()
                  .map((s) => s.id),
              }),
            },
          ],
          isError: true,
        },
      };
    }

    return { session };
  }

  /**
   * Validates that a debug session exists and is in paused state.
   *
   * First validates session existence using {@link validateSession}, then checks that
   * the session's status is 'paused'. This is required for operations that need access
   * to execution context (stack traces, variables, scopes). If session is running or
   * terminated, returns an error with the current status and a helpful hint about
   * setting breakpoints.
   *
   * Return value uses discriminated union pattern - check for 'error' property to
   * determine if validation succeeded.
   * @param {string} sessionId - Unique identifier of the debug session to validate
   * @returns {{ session: DebugSession } | { error: CallToolResult }} Either `{ session: DebugSession }` if paused, or `{ error: CallToolResult }` if not found/not paused
   * @example
   * ```typescript
   * const validation = validator.validatePausedSession('session-123');
   * if ('error' in validation) {
   *   return validation.error; // Includes helpful hint about breakpoints
   * }
   * const { session } = validation;
   * // Session is guaranteed to be paused - safe to get stack trace
   * const stack = await session.adapter.getStackTrace();
   * ```
   * @public
   * @see file:../types/handlers.ts:109-111 - ISessionValidator.validatePausedSession interface
   * @see file:../handlers/get-stacktrace-handler.ts:31 - Usage in stacktrace handler
   * @see file:../handlers/get-variables-handler.ts:69 - Usage in variables handler
   */
  public validatePausedSession(
    sessionId: string,
  ): { session: DebugSession } | { error: CallToolResult } {
    const validation = this.validateSession(sessionId);

    if ('error' in validation) {
      return validation;
    }

    const { session } = validation;

    if (session.state.status !== 'paused') {
      return {
        error: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'Session is not paused. This operation is only available when execution is paused.',
                sessionId,
                currentStatus: session.state.status,
                hint: 'Set a breakpoint and trigger it to pause execution',
              }),
            },
          ],
          isError: true,
        },
      };
    }

    return { session };
  }

  /**
   * Creates a standardized "session not found" error response.
   *
   * Generates a consistent error format used when mock session validation fails.
   * Includes the requested session ID and a list of all active real session IDs
   * to help with debugging. The error is formatted as a CallToolResult ready to
   * be returned from tool handlers.
   * @param {string} sessionId - Session ID that was not found
   * @returns {CallToolResult} CallToolResult with error details and list of active sessions
   * @public
   * @see file:../types/handlers.ts:182-186 - CallToolResult interface
   */
  public createSessionNotFoundError(sessionId: string): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Session not found',
            sessionId,
            activeSessions: this.sessionManager.listSessions().map((s) => s.id),
          }),
        },
      ],
      isError: true,
    };
  }

  /**
   * Creates a standardized error response for handler exceptions.
   *
   * Generates a consistent error format for unexpected exceptions in tool handlers.
   * Extracts the error message from Error objects or uses 'Unknown error' as fallback.
   * Optionally includes the operation name and full stack trace for debugging.
   * The error is formatted as a CallToolResult with pretty-printed JSON (2-space indent).
   *
   * This method is used in try-catch blocks across all handlers to ensure consistent
   * error reporting to MCP clients.
   * @param {string} sessionId - Session ID where the error occurred
   * @param {unknown} error - The caught exception (typically an Error object)
   * @param {string} [operation] - Optional operation name for context (e.g., 'get_stack_trace', 'continue_debug_session')
   * @returns {CallToolResult} CallToolResult with error message, session ID, optional operation, and stack trace
   * @example
   * ```typescript
   * try {
   *   await session.adapter.getStackTrace();
   * } catch (error) {
   *   return validator.createHandlerError(
   *     sessionId,
   *     error,
   *     'get_stack_trace'
   *   );
   * }
   * ```
   * @public
   * @see file:../types/handlers.ts:112-116 - ISessionValidator.createHandlerError interface
   * @see file:../handlers/get-stacktrace-handler.ts:56 - Usage example
   * @see file:../handlers/continue-handler.ts:177 - Usage example
   */
  public createHandlerError(
    sessionId: string,
    error: unknown,
    operation?: string,
  ): CallToolResult {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorData: Record<string, unknown> = {
      error: errorMessage,
      sessionId,
    };

    if (operation) {
      errorData.operation = operation;
    }

    if (error instanceof Error && error.stack) {
      errorData.details = error.stack;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorData, null, 2),
        },
      ],
      isError: true,
    };
  }
}
