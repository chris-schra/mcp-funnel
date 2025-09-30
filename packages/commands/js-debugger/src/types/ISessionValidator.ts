import type { CallToolResult } from './CallToolResult.js';
import type { DebugSession } from './DebugSession.js';

/**
 * Session validation utilities - eliminates DRY violations
 */
export interface ISessionValidator {
  validateSession(
    sessionId: string,
  ): { session: DebugSession } | { error: CallToolResult };
  validatePausedSession(
    sessionId: string,
  ): { session: DebugSession } | { error: CallToolResult };
  createHandlerError(
    sessionId: string,
    error: unknown,
    operation?: string,
  ): CallToolResult;
}
