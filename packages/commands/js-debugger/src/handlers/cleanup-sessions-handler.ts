import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
} from '../types.js';

export interface CleanupSessionsHandlerArgs {
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Handler for cleaning up inactive debug sessions
 * Implements the IToolHandler SEAM for modular tool handling
 */
export class CleanupSessionsHandler
  implements IToolHandler<CleanupSessionsHandlerArgs>
{
  readonly name = 'cleanup_sessions';

  async handle(
    args: CleanupSessionsHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      const allSessions = context.sessionManager.listSessions();
      const cleanupConfig = context.sessionManager.getCleanupConfig?.() || {
        sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
        memoryThresholdBytes: 100 * 1024 * 1024, // 100MB
      };

      // Identify sessions that would be cleaned up
      const inactiveSessions = allSessions.filter((session) => {
        const lastActivity = session.metadata?.lastActivity;
        if (!lastActivity) return false;

        const lastActivityTime = new Date(lastActivity).getTime();
        const now = new Date().getTime();
        const isInactive =
          now - lastActivityTime > cleanupConfig.sessionTimeoutMs;

        const hasExceededMemory =
          session.metadata?.resourceCount &&
          session.metadata.resourceCount > 100; // Rough threshold

        return args.force || isInactive || hasExceededMemory;
      });

      if (args.dryRun) {
        return context.responseFormatter.success({
          dryRun: true,
          totalSessions: allSessions.length,
          sessionsToCleanup: inactiveSessions.length,
          cleanupCandidates: inactiveSessions.map((session) => ({
            sessionId: session.id,
            platform: session.platform,
            lastActivity: session.metadata?.lastActivity,
            lifecycleState: session.metadata?.lifecycleState,
            resourceCount: session.metadata?.resourceCount,
          })),
          cleanupConfig,
          message: 'Dry run completed - no sessions were actually cleaned up',
        });
      }

      // Perform actual cleanup
      const cleanedCount =
        (await context.sessionManager.cleanupInactiveSessions?.()) || 0;

      return context.responseFormatter.success({
        totalSessions: allSessions.length,
        cleanedSessions: cleanedCount,
        remainingSessions: allSessions.length - cleanedCount,
        cleanupConfig,
        message: `Successfully cleaned up ${cleanedCount} inactive sessions`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return context.responseFormatter.error(
        error instanceof Error ? error.message : 'Unknown error',
        {
          operation: 'cleanup_sessions',
          message: 'Failed to cleanup sessions',
        },
      );
    }
  }
}
