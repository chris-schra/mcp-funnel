import type { DebugSession } from '../types/index.js';
import type { EnhancedDebugSession } from '../enhanced-debug-session.js';
import type { SessionCompatibilityWrapper } from '../session-compatibility-wrapper.js';
import type { TerminatedSessionManager } from './terminated-session-manager.js';

/**
 * Context for waiting for pause operation
 */
export interface WaitForPauseContext {
  sessions: Map<string, EnhancedDebugSession>;
  compatibilitySessions: Map<string, SessionCompatibilityWrapper>;
  terminatedSessionManager: TerminatedSessionManager;
}

/**
 * Wait for a session to enter paused state
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
