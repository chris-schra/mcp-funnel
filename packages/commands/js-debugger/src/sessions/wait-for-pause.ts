import type { DebugSession } from '../types/index.js';
import type { EnhancedDebugSession } from '../enhanced-debug-session.js';
import type { SessionCompatibilityWrapper } from '../session-compatibility-wrapper.js';
import type { TerminatedSessionManager } from './terminated-session-manager.js';

/**
 * Context for waiting for pause operation.
 *
 * Provides access to session stores and the terminated session manager
 * needed for the polling-based pause detection.
 * @public
 * @see file:./wait-for-pause.ts:21 - Used by waitForPause function
 */
export interface WaitForPauseContext {
  /** Active enhanced debug sessions by session ID */
  sessions: Map<string, EnhancedDebugSession>;
  /** Compatibility wrappers for enhanced sessions */
  compatibilitySessions: Map<string, SessionCompatibilityWrapper>;
  /** Manager tracking terminated sessions */
  terminatedSessionManager: TerminatedSessionManager;
}

/**
 * Polls a debug session until it reaches 'paused' or 'terminated' state, or times out.
 *
 * This function implements a polling strategy checking session state every 50ms.
 * It handles three exit conditions:
 * 1. Session enters 'paused' state - returns session
 * 2. Session enters 'terminated' state - returns session
 * 3. Timeout expires - returns current session regardless of state
 *
 * Returns `undefined` only if the session doesn't exist at all.
 * Always prefers returning a compatibility wrapper when available.
 * @param {string} sessionId - Unique identifier of the session to wait for
 * @param {WaitForPauseContext} context - Context containing session stores and managers
 * @param {number} timeoutMs - Maximum time to wait in milliseconds (default: 10000)
 * @returns {Promise<DebugSession | undefined>} Promise resolving to the session (or undefined if session not found)
 * @example
 * ```typescript
 * const session = await waitForPause('session-123', {
 *   sessions: activeSessionsMap,
 *   compatibilitySessions: wrappersMap,
 *   terminatedSessionManager
 * }, 5000);
 *
 * if (session && session.state.status === 'paused') {
 *   console.log('Paused at breakpoint');
 * }
 * ```
 * @remarks
 * This function always resolves, never rejects. It returns the session
 * in whatever state it reaches when timeout expires, even if not paused.
 * Callers must check the returned session's state.status to determine
 * if it actually paused.
 * @public
 * @see file:../session-manager.ts:654 - Called by SessionManager.waitForPause
 * @see file:../handlers/debug-handler.ts:233 - Used in debug tool handler
 */
export async function waitForPause(
  sessionId: string,
  context: WaitForPauseContext,
  timeoutMs = 10000,
): Promise<DebugSession | undefined> {
  const start = Date.now();

  return await new Promise((resolve) => {
    const check = () => {
      const session = context.sessions.get(sessionId);
      const resolvedSession =
        session ?? context.terminatedSessionManager.get(sessionId);
      if (!resolvedSession) {
        resolve(undefined);
        return;
      }

      if (resolvedSession.state.status === 'paused') {
        // Return compatibility wrapper if it's an enhanced session
        const compatWrapper = context.compatibilitySessions.get(sessionId);
        resolve(compatWrapper || (resolvedSession as DebugSession));
        return;
      }

      if (resolvedSession.state.status === 'terminated') {
        // Return compatibility wrapper if it's an enhanced session
        const compatWrapper = context.compatibilitySessions.get(sessionId);
        resolve(compatWrapper || (resolvedSession as DebugSession));
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        // Return compatibility wrapper if it's an enhanced session
        const compatWrapper = context.compatibilitySessions.get(sessionId);
        resolve(compatWrapper || (resolvedSession as DebugSession));
        return;
      }

      setTimeout(check, 50);
    };

    check();
  });
}
