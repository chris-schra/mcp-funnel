import type {
  ISessionValidator,
  ISessionManager,
  IMockSessionManager,
  DebugSession,
  CallToolResult,
} from '../types/index.js';

/**
 * Session validation utilities - eliminates DRY violations across handlers
 * Provides standardized session validation and error responses
 */
export class SessionValidator implements ISessionValidator {
  constructor(
    private sessionManager: ISessionManager,
    private mockSessionManager?: IMockSessionManager,
  ) {}

  /**
   * Validates that a session exists (real or mock)
   * Returns either the session or a standardized error response
   */
  validateSession(
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
   * Validates that a session exists and is in paused state
   * Used by handlers that require the debugger to be paused (stack trace, variables, etc.)
   */
  validatePausedSession(
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
   * Creates a standardized "session not found" error for when mock session validation fails
   */
  createSessionNotFoundError(sessionId: string): CallToolResult {
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
   * Creates a standardized error response for handler exceptions
   */
  createHandlerError(
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
