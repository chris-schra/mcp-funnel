import { EnhancedDebugSession } from '../enhanced-debug-session.js';
import { ProcessHandlerManager } from './process-handlers.js';
import { CleanupManager } from './cleanup-manager.js';
import { SessionResourceTracker } from './resource-tracker.js';
import { SessionActivityTracker } from './activity-tracker.js';

/**
 * Context for shutdown operations.
 *
 * @internal
 */
export interface ShutdownContext {
  sessions: Map<string, EnhancedDebugSession>;
  processHandlerManager: ProcessHandlerManager;
  cleanupManager: CleanupManager;
  resourceTracker: SessionResourceTracker;
  activityTracker: SessionActivityTracker;
  deleteSession: (sessionId: string) => Promise<void>;
}

/**
 * Performs graceful shutdown of all sessions and cleanup of global resources.
 *
 * Terminates all active debug sessions, stops the cleanup manager's background
 * interval, removes process signal handlers (SIGINT, SIGTERM), and cleans up
 * tracking data structures. This method is idempotent - multiple calls are safe.
 *
 * Shutdown sequence:
 * 1. Set shutdown flag to prevent new operations
 * 2. Remove process signal handlers
 * 3. Stop cleanup manager background tasks
 * 4. Terminate all active sessions in parallel
 * 5. Clean up resource and activity trackers
 *
 * This method is automatically called on process signals (SIGINT, SIGTERM) and
 * should also be called when tests complete or when the application is shutting down.
 * @param context - Shutdown context with cleanup manager, trackers, and session registry
 * @example Application shutdown
 * ```typescript
 * await performShutdown(context);
 * ```
 * @public
 * @see file:./process-handlers.ts:25-45 - Process signal handling
 * @see file:./cleanup-manager.ts:140-160 - Cleanup manager shutdown
 */
export async function performShutdown(context: ShutdownContext): Promise<void> {
  context.processHandlerManager.removeHandlers();

  console.info('SessionManager shutting down...');

  // Shutdown cleanup manager
  await context.cleanupManager.shutdown();

  // Clean up all active sessions
  const sessionIds = Array.from(context.sessions.keys());
  const cleanupPromises = sessionIds.map(async (sessionId) => {
    try {
      await context.deleteSession(sessionId);
    } catch (error) {
      console.warn(
        `Error cleaning up session ${sessionId} during shutdown:`,
        error,
      );
    }
  });

  await Promise.allSettled(cleanupPromises);

  // Clean up trackers
  context.resourceTracker.cleanup();
  context.activityTracker.cleanup();

  console.info('SessionManager shutdown complete');
}
